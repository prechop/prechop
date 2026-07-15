import {
	ErrInvalidWebhookSignature,
	ErrPaymentAmountMismatch,
	ErrPaymentVerification,
	koboToNaira,
	tryDecrypt,
} from "../../constants";
import {
	claimPaymentWebhookDB,
	getBuyerOrderByIdDB,
	getPaymentByRefDB,
	getUserByIdWithPhoneDB,
	getVendorProfileByIdDB,
	incrementDailyOrderItemQuantityDB,
	incrementDailyOrderTotalCountDB,
	incrementVendorOrderCountDB,
	markBuyerOrderPaidDB,
} from "../../models";
import { sendchampProvider } from "../../providers";
import { commitSlots } from "../buyerOrders/slots";
import { createUserNotification, notifyOrderConfirmed } from "../notifications";
import { issueRefund } from "../refunds";

interface PaystackChargeEvent {
	event: string;
	data: {
		reference: string;
		amount: number;
		requested_amount?: number;
		channel: string;
		status: string;
	};
}

export async function handlePaystackWebhook({
	rawBody,
	signature,
}: {
	rawBody: string;
	signature: string | undefined;
}): Promise<{ received: boolean; orderNumber?: string }> {
	// 1. Verify signature before touching anything.
	const { paystackProvider } = await import("../../providers");
	if (!paystackProvider.verifyWebhookSignature(rawBody, signature)) {
		throw ErrInvalidWebhookSignature;
	}

	const event = JSON.parse(rawBody) as PaystackChargeEvent;
	if (event.event !== "charge.success") return { received: true };

	const { reference, amount, channel, status } = event.data;
	if (status !== "success") return { received: true };

	// 2. Look up the payment.
	const payment = await getPaymentByRefDB({ paystackRef: reference });
	if (!payment) throw ErrPaymentVerification;

	// 3. Idempotency: already processed → no-op (200).
	if (payment.webhookVerified) return { received: true };

	// 4. Amount must match the order total exactly. Validate the amount actually
	// SETTLED (`amount`), never `requested_amount`: if partial payments are ever
	// enabled, an under-payment must not be accepted as full payment for the order.
	if (amount !== payment.amountKobo) throw ErrPaymentAmountMismatch;

	// 5. Atomically claim (first webhook wins; concurrent duplicate → no-op).
	const claimed = await claimPaymentWebhookDB({
		paystackRef: reference,
		channel,
	});
	if (!claimed) return { received: true };

	// 6. Transition the order to PAID.
	const order = await getBuyerOrderByIdDB({ id: payment.buyerOrderId });
	if (!order) throw ErrPaymentVerification;
	const paid = await markBuyerOrderPaidDB({
		id: order._id.toString(),
		channel,
	});

	// 6a. Late settlement on a dead order. `markBuyerOrderPaidDB` only transitions
	// PENDING/AWAITING orders, so `null` means the order is no longer payable —
	// typically the abandoned-order sweep already CANCELLED it and marked the
	// payment ABANDONED, but `claimPaymentWebhookDB` (which filters only on
	// {paystackRef, webhookVerified:false}) still matched a late `charge.success`
	// and settled money at Paystack. There is no live order to fulfil, so we must
	// NOT commit slots, increment counts, or send a confirmation. Instead refund
	// the buyer in full and leave a reconciliation trail.
	if (!paid) {
		console.warn(
			`[webhook] LATE SETTLEMENT on non-payable order — refunding in full: order=${order._id.toString()} ref=${reference} amountKobo=${payment.amountKobo}`,
		);
		try {
			// `issueRefund` writes the idempotent `refunds` row BEFORE calling
			// Paystack (unique paymentId index → no double payout) and, on a
			// provider failure, leaves that row unprocessed as the reconciliation
			// queue. Best-effort so a refund error still 200s the webhook — a 500
			// here would make Paystack retry against money that has already moved.
			await issueRefund({
				orderId: order._id.toString(),
				amountKobo: payment.amountKobo,
				reason: "Payment settled after the order was already cancelled.",
				paystackRef: reference,
			});
		} catch (error) {
			console.error(
				`[webhook] refund of late settlement failed — refund row left for reconciliation: order=${order._id.toString()} ref=${reference} amountKobo=${payment.amountKobo}:`,
				error,
			);
		}
		return { received: true };
	}

	// 7. Commit capacity: bump listing ordered quantities + counts.
	await Promise.allSettled(
		order.items.map((item) =>
			incrementDailyOrderItemQuantityDB({
				dailyOrderId: order.dailyOrderId.toString(),
				dailyOrderItemId: item.dailyOrderItemId.toString(),
				by: item.quantity,
			}),
		),
	);
	await incrementDailyOrderTotalCountDB({
		dailyOrderId: order.dailyOrderId.toString(),
	});
	await incrementVendorOrderCountDB({ id: order.vendorId.toString() });
	await commitSlots(
		order.items.map((i) => ({
			dailyOrderItemId: i.dailyOrderItemId.toString(),
			quantity: i.quantity,
		})),
	);

	// 8. Notify vendor + buyer (fire-and-forget).
	void notifyParties(order);

	return { received: true, orderNumber: order.orderNumber };
}

async function notifyParties(order: {
	orderNumber: string;
	vendorId: string;
	buyerId: string;
	totalKobo: number;
}): Promise<void> {
	let vendorName = "";
	// The vendor and buyer legs are isolated on purpose. They used to share one
	// try/catch, which made the buyer — who has just parted with money and is the
	// party most owed a confirmation — hostage to a vendor-profile lookup: one
	// throw there and the payer was told nothing at all.
	try {
		const vendor = await getVendorProfileByIdDB({
			id: order.vendorId.toString(),
		});
		vendorName = vendor?.businessName ?? "";
		if (vendor?.userId) {
			createUserNotification({
				userId: vendor.userId.toString(),
				title: "New paid order",
				body: `Order ${order.orderNumber} • ₦${koboToNaira(order.totalKobo).toLocaleString()}`,
				type: "ORDER_PAID",
				data: { orderNumber: order.orderNumber },
			});
			const vendorUser = await getUserByIdWithPhoneDB({
				id: vendor.userId.toString(),
			});
			const phone = vendorUser?.phone ? tryDecrypt(vendorUser.phone) : "";
			if (phone) {
				sendchampProvider
					.sendVendorNewOrder(
						phone,
						order.orderNumber,
						koboToNaira(order.totalKobo),
					)
					.catch(() => {});
			}
		}
	} catch (error) {
		console.error("[webhook] notify vendor failed:", error);
	}

	// Buyer confirmation: in-app + SMS (PRD marks this one SMS). The buyer may
	// well have closed the tab the moment Paystack redirected, so an in-app-only
	// confirmation is invisible to them.
	//
	// The SMS inside is fire-and-forget by construction (notifyOrderConfirmed
	// voids it and swallows provider errors), and this whole function is called
	// as `void notifyParties(order)` after the order is already marked paid — so
	// neither a Sendchamp outage nor a Mongo blip here can 500 the webhook and
	// trigger a Paystack retry against money that has already moved.
	try {
		await notifyOrderConfirmed({
			buyerId: order.buyerId.toString(),
			orderNumber: order.orderNumber,
			// Falls back only if the vendor profile is gone/unreadable, which for a
			// just-paid order means a broken invariant, not a normal path.
			vendorName: vendorName || "your vendor",
		});
	} catch (error) {
		console.error("[webhook] notify buyer failed:", error);
	}
}
