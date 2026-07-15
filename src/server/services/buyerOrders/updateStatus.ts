import {
	ErrForbidden,
	ErrOrderNotFound,
	invalidOrderState,
} from "../../constants";
import {
	getBuyerOrderByIdDB,
	getVendorProfileByUserIdDB,
	OrderStatus,
	setBuyerOrderStatusDB,
} from "../../models";
import { notifyOrderConfirmed, notifyOrderReady } from "../notifications";
import { generateReceiptInBackground } from "./receiptPdf";

const VALID_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
	[OrderStatus.PAID]: [OrderStatus.CONFIRMED],
	[OrderStatus.CONFIRMED]: [OrderStatus.PREPARING],
	[OrderStatus.PREPARING]: [OrderStatus.READY],
	[OrderStatus.READY]: [OrderStatus.COMPLETED],
};

export async function updateOrderStatus({
	vendorUserId,
	orderId,
	status,
}: {
	vendorUserId: string;
	orderId: string;
	status: OrderStatus;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId: vendorUserId });
	if (!vendor) throw ErrForbidden;

	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (order.vendorId.toString() !== vendor._id.toString()) throw ErrForbidden;

	const allowed = VALID_TRANSITIONS[order.status as OrderStatus] ?? [];
	if (!allowed.includes(status)) {
		throw invalidOrderState(
			`Cannot transition from ${order.status} to ${status}.`,
		);
	}

	const updated = await setBuyerOrderStatusDB({
		id: orderId,
		status,
		fromStatuses: [order.status as OrderStatus],
	});
	if (!updated)
		throw invalidOrderState("Order status changed — please retry.");

	// In-app + SMS (PRD marks both of these SMS). Routed through the shared
	// notify helpers rather than a bare `createUserNotification` so the buyer
	// actually gets the text: READY is the highest-value message in the product
	// (the buyer is not in the app and the food is going cold), and CONFIRMED
	// reaches someone who has paid and closed the tab.
	//
	// Deliberately not awaited, and `.catch`-guarded on top: the notification is
	// a side effect of a status transition that has ALREADY been committed by the
	// conditional write above. Letting an SMS/push failure reject here would
	// surface as a 500 on a transition that in fact succeeded, and the vendor
	// would retry into an `invalidOrderState`. Both helpers already swallow their
	// own delivery errors; this guard means a future change inside them still
	// cannot fail the transition.
	if (status === OrderStatus.READY) {
		void notifyOrderReady({
			buyerId: order.buyerId.toString(),
			orderNumber: order.orderNumber,
			vendorName: vendor.businessName,
		}).catch((error) =>
			console.error(
				`[orders] ORDER_READY notification failed for ${orderId}:`,
				error,
			),
		);
	} else if (status === OrderStatus.CONFIRMED) {
		void notifyOrderConfirmed({
			buyerId: order.buyerId.toString(),
			orderNumber: order.orderNumber,
			// Matches the webhook path's fallback. Unlike ORDER_READY, the
			// confirmed copy has no vendor-less variant to branch to.
			vendorName: vendor.businessName || "your vendor",
		}).catch((error) =>
			console.error(
				`[orders] ORDER_CONFIRMED notification failed for ${orderId}:`,
				error,
			),
		);
	}

	// Receipt (PRD §8.13). Fired only by the caller that actually won the
	// conditional status write above, so a double-submit cannot email two
	// receipts. Deliberately not awaited: rendering a PDF and calling Resend
	// must not sit in the vendor's request path, and a failure here is
	// recoverable on the GET /orders/{id}/receipt path.
	if (status === OrderStatus.COMPLETED) {
		generateReceiptInBackground(orderId);
	}

	return updated;
}
