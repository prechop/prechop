import { ErrOrderNotFound, notFound } from "../../constants";
import { generateReceiptPdf } from "../../helpers/receipt";
import {
	getBuyerOrderByIdDB,
	getUserByIdDB,
	getVendorProfileByIdDB,
	OrderStatus,
	setBuyerOrderReceiptStatusDB,
} from "../../models";
import type { IBuyerOrder } from "../../models/buyerOrders/types";
import { resendProvider, s3Provider } from "../../providers";

/** Signed receipt links are bearer credentials — keep them short-lived. */
const RECEIPT_URL_TTL_SECONDS = 300; // 5 min

/**
 * The receipt object key is DERIVED from the order id, never stored.
 *
 * The obvious move would be to persist the key on the order, but `receiptUrl`
 * already means something else entirely — it holds the public `/receipt/{token}`
 * link that `getPublicReceipt` looks orders up by — so writing an S3 key into it
 * would break the "Pay for Me" receipt flow. A deterministic key needs no new
 * column and no migration, and makes generation naturally idempotent: a re-run
 * overwrites the same object instead of orphaning a second PDF.
 */
export function receiptObjectKey(orderId: string): string {
	return `receipts/order-${orderId}.pdf`;
}

/** Receipts are proof of a finished transaction — only COMPLETED orders have one. */
export function isReceiptEligible(status: OrderStatus): boolean {
	return status === OrderStatus.COMPLETED;
}

async function buildReceiptPdf(order: IBuyerOrder): Promise<{
	buffer: Buffer;
	buyerName: string;
	buyerEmail: string;
	vendorName: string;
}> {
	const [buyer, vendor] = await Promise.all([
		getUserByIdDB({ id: order.buyerId.toString() }),
		getVendorProfileByIdDB({ id: order.vendorId.toString() }),
	]);

	const buyerName = buyer
		? `${buyer.firstName} ${buyer.lastName}`.trim()
		: "PreChop buyer";
	const vendorName = vendor?.businessName ?? "PreChop vendor";

	const buffer = await generateReceiptPdf({
		orderNumber: order.orderNumber,
		buyerName,
		vendorName,
		createdAt: order.createdAt,
		fulfillmentType: order.fulfillmentType,
		items: order.items.map((item) => ({
			name: item.snapshotName,
			quantity: item.quantity,
			subtotalKobo: item.subtotalKobo,
		})),
		subtotalKobo: order.subtotalKobo,
		deliveryFeeKobo: order.deliveryFeeKobo,
		platformFeeKobo: order.platformFeeKobo,
		paymentProcessingFeeKobo: order.paymentProcessingFeeKobo,
		totalKobo: order.totalKobo,
	});

	return { buffer, buyerName, buyerEmail: buyer?.email ?? "", vendorName };
}

/**
 * Render the receipt PDF, store it, and email it to the buyer. Idempotent: the
 * object key is stable, so a retry overwrites rather than duplicates.
 *
 * Returns the object key, or null when the order is not receipt-eligible.
 */
export async function generateAndStoreReceipt({
	orderId,
	email = true,
}: {
	orderId: string;
	/** Skip the email when re-rendering a PDF the buyer is already fetching. */
	email?: boolean;
}): Promise<string | null> {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (!isReceiptEligible(order.status as OrderStatus)) return null;

	const { buffer, buyerName, buyerEmail, vendorName } =
		await buildReceiptPdf(order);

	const key = await s3Provider.uploadBuffer(
		"receipts",
		`order-${orderId}.pdf`,
		buffer,
		"application/pdf",
	);

	if (email) {
		if (!buyerEmail) {
			// LOUD on purpose. This used to be a silent `if (email && buyerEmail)`
			// skip, so `generateAndStoreReceipt` reported success while no buyer
			// had ever actually received a receipt — the failure mode is invisible
			// precisely because nothing throws and the PDF really is stored.
			//
			// Not thrown: the receipt itself succeeded and is durably in S3, and
			// throwing would mark a stored receipt FAILED and break the on-demand
			// fetch path. A buyer with no address is a data-completeness gap, not
			// a receipt failure — so it is reported, not escalated.
			console.error(
				`[receipts] order ${orderId}: receipt stored at ${key} but buyer ${order.buyerId.toString()} has no email on record — receipt email NOT sent`,
			);
		} else {
			// The PDF is already durably stored — a bounced email must not fail the
			// receipt. `sendReceiptEmail` swallows its own errors, so this is belt
			// and braces.
			await resendProvider
				.sendReceiptEmail({
					to: buyerEmail,
					buyerName,
					orderNumber: order.orderNumber,
					vendorName,
					receiptPdfBuffer: buffer,
				})
				.catch((error) =>
					console.error(
						`[receipts] email failed for order ${orderId}:`,
						error,
					),
				);
		}
	}

	return key;
}

/**
 * Fire-and-forget receipt generation for the COMPLETED transition. Never throws:
 * a receipt failure must not roll back or fail the vendor's status update — the
 * fetch path below regenerates on demand anyway.
 *
 * This is the ONLY writer of `receiptStatus`, which makes the ordering below
 * load-bearing rather than stylistic: every path that writes PENDING must have a
 * path that leaves it.
 */
export function generateReceiptInBackground(orderId: string): void {
	void (async () => {
		const order = await getBuyerOrderByIdDB({ id: orderId });
		// A missing order is a genuine failure, and it is deliberately NOT a
		// FAILED write: there is no document to write to. It throws so the tail
		// catch reports it, matching `generateAndStoreReceipt`'s contract.
		if (!order) throw ErrOrderNotFound;

		// Eligibility is settled BEFORE the PENDING write, not inferred afterwards
		// from `generateAndStoreReceipt`'s null return. Marking PENDING first and
		// only then discovering the order was never eligible would strand it on
		// PENDING forever — nothing else writes this field — and spin the UI on a
		// receipt no job will ever produce. A non-eligible order keeps its absent
		// status, which is precisely what the UI reads as "render nothing".
		if (!isReceiptEligible(order.status as OrderStatus)) return;

		await setBuyerOrderReceiptStatusDB({
			id: orderId,
			receiptStatus: "PENDING",
		});

		try {
			const key = await generateAndStoreReceipt({ orderId });
			// READY only on a truthy key. A null this late means the order stopped
			// being eligible between the check above and the render (a refund
			// racing us) — that is not a receipt, and PENDING is no longer an
			// option now that it is on the document, so FAILED is the terminal
			// truth. Either way the order leaves PENDING.
			await setBuyerOrderReceiptStatusDB({
				id: orderId,
				receiptStatus: key ? "READY" : "FAILED",
			});
		} catch (error) {
			await setBuyerOrderReceiptStatusDB({
				id: orderId,
				receiptStatus: "FAILED",
			});
			throw error;
		}
	})().catch((error) =>
		console.error(
			`[receipts] background generation failed for order ${orderId}:`,
			error,
		),
	);
}

/**
 * Authorised fetch path for `GET /orders/{id}/receipt`.
 *
 * Returns a freshly-signed, short-lived URL rather than persisting a long-lived
 * one: a 1-year pre-signed URL stored on the order would leak a working
 * credential into every response that serialises the order, and would expire
 * silently with no way to tell. Signing per request keeps the credential scoped
 * to one authorised caller and one short window.
 *
 * Self-healing: if the object is missing (generation failed, or the order
 * completed before receipts shipped) it is rendered synchronously here.
 */
export async function getReceiptDownloadUrl({
	orderId,
	order,
}: {
	orderId: string;
	order: IBuyerOrder;
}): Promise<string> {
	if (!isReceiptEligible(order.status as OrderStatus)) {
		throw notFound("A receipt for this order");
	}

	const key = receiptObjectKey(orderId);
	if (!(await s3Provider.objectExists(key))) {
		const generated = await generateAndStoreReceipt({
			orderId,
			email: false,
		});
		if (!generated) throw notFound("A receipt for this order");
	}

	return s3Provider.getPresignedReadUrl(key, RECEIPT_URL_TTL_SECONDS);
}
