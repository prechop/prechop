import {
	ErrForbidden,
	ErrOrderNotFound,
	invalidOrderState,
} from "../../constants";
import {
	FulfillmentType,
	getBuyerOrderByIdDB,
	getVendorProfileByUserIdDB,
	OrderStatus,
	setBuyerOrderStatusDB,
} from "../../models";
import {
	notifyOrderAccepted,
	notifyOrderConfirmed,
	notifyOrderInTransit,
	notifyOrderReady,
	notifyOrderRefundPending,
} from "../notifications";
import { issueRefund } from "../refunds";
import { generateReceiptInBackground } from "./receiptPdf";

const VALID_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
	[OrderStatus.AWAITING_VENDOR_ACCEPTANCE]: [
		OrderStatus.ACCEPTED,
		OrderStatus.VENDOR_REJECTED,
	],
	[OrderStatus.ACCEPTED]: [OrderStatus.COOKING],
	[OrderStatus.PAID]: [OrderStatus.CONFIRMED],
	[OrderStatus.CONFIRMED]: [OrderStatus.PREPARING],
	[OrderStatus.COOKING]: [OrderStatus.READY],
	[OrderStatus.PREPARING]: [OrderStatus.READY],
	[OrderStatus.READY]: [OrderStatus.IN_TRANSIT],
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
	if (
		status === OrderStatus.IN_TRANSIT &&
		order.fulfillmentType !== FulfillmentType.DELIVERY
	) {
		throw invalidOrderState("Only delivery orders can move in transit.");
	}
	if (
		status === OrderStatus.ACCEPTED &&
		order.status !== OrderStatus.AWAITING_VENDOR_ACCEPTANCE
	) {
		throw invalidOrderState("Only awaiting orders can be accepted.");
	}
	if (
		status === OrderStatus.VENDOR_REJECTED &&
		order.status !== OrderStatus.AWAITING_VENDOR_ACCEPTANCE
	) {
		throw invalidOrderState("Only awaiting orders can be rejected.");
	}
	if (
		order.status === OrderStatus.READY &&
		status === OrderStatus.COMPLETED &&
		order.fulfillmentType === FulfillmentType.DELIVERY
	) {
		throw invalidOrderState(
			"Delivery orders must be marked in transit before completion.",
		);
	}

	if (status === OrderStatus.ACCEPTED) {
		const acceptedAt = new Date();
		const accepted = await setBuyerOrderStatusDB({
			id: orderId,
			status: OrderStatus.ACCEPTED,
			fromStatuses: [OrderStatus.AWAITING_VENDOR_ACCEPTANCE],
			acceptedAt,
			acceptanceDeadline: order.acceptanceDeadline,
		});
		if (!accepted)
			throw invalidOrderState("Order status changed â€” please retry.");

		const cooking = await setBuyerOrderStatusDB({
			id: orderId,
			status: OrderStatus.COOKING,
			fromStatuses: [OrderStatus.ACCEPTED],
		});
		if (!cooking)
			throw invalidOrderState("Order status changed â€” please retry.");

		void notifyOrderAccepted({
			buyerId: order.buyerId.toString(),
			orderNumber: order.orderNumber,
			vendorName: vendor.businessName || "Your vendor",
		}).catch((error) =>
			console.error(
				`[orders] ORDER_ACCEPTED notification failed for ${orderId}:`,
				error,
			),
		);
		return cooking;
	}

	if (status === OrderStatus.VENDOR_REJECTED) {
		const rejected = await setBuyerOrderStatusDB({
			id: orderId,
			status: OrderStatus.VENDOR_REJECTED,
			fromStatuses: [OrderStatus.AWAITING_VENDOR_ACCEPTANCE],
			vendorRejectedAt: new Date(),
		});
		if (!rejected)
			throw invalidOrderState("Order status changed â€” please retry.");

		await setBuyerOrderStatusDB({
			id: orderId,
			status: OrderStatus.REFUND_PENDING,
			fromStatuses: [OrderStatus.VENDOR_REJECTED],
			refundPendingAt: new Date(),
		});

		const reason =
			"The vendor rejected this order, so your refund has started.";
		try {
			await issueRefund({
				orderId,
				amountKobo: order.totalKobo,
				reason,
			});
		} finally {
			void notifyOrderRefundPending({
				buyerId: order.buyerId.toString(),
				orderNumber: order.orderNumber,
				reason,
			}).catch((error) =>
				console.error(
					`[orders] ORDER_REFUND_PENDING notification failed for ${orderId}:`,
					error,
				),
			);
		}
		return (await getBuyerOrderByIdDB({ id: orderId })) ?? rejected;
	}

	const updated = await setBuyerOrderStatusDB({
		id: orderId,
		status,
		fromStatuses: [order.status as OrderStatus],
		readyAt: status === OrderStatus.READY ? new Date() : undefined,
		deliveryStartedAt:
			status === OrderStatus.IN_TRANSIT ? new Date() : undefined,
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
	} else if (status === OrderStatus.IN_TRANSIT) {
		void notifyOrderInTransit({
			buyerId: order.buyerId.toString(),
			orderNumber: order.orderNumber,
		}).catch((error) =>
			console.error(
				`[orders] ORDER_IN_TRANSIT notification failed for ${orderId}:`,
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
