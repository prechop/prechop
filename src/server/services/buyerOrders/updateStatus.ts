import { isVendorStatusTransitionAllowed } from "@/constants/orderLifecycle";
import {
	acceptanceDeadlineExpired,
	ErrForbidden,
	ErrOrderNotFound,
	invalidOrderState,
} from "../../constants";
import {
	appendBuyerOrderTimelineDB,
	FulfillmentType,
	getBuyerOrderByIdDB,
	getVendorProfileByUserIdDB,
	OrderStatus,
	setBuyerOrderStatusDB,
} from "../../models";
import {
	createUserNotification,
	notifyAdminAttention,
	notifyOrderAccepted,
	notifyOrderConfirmed,
	notifyOrderInTransit,
	notifyOrderReady,
	notifyOrderRefundPending,
} from "../notifications";
import { issueRefund, type RefundOutcome } from "../refunds";
import { generateReceiptInBackground } from "./receiptPdf";
import { expireVendorAcceptanceOrder } from "./vendorAcceptance";

export async function updateOrderStatus({
	vendorUserId,
	orderId,
	status,
	reason,
	reasonCode,
	explanation,
}: {
	vendorUserId: string;
	orderId: string;
	status: OrderStatus;
	reason?: string;
	reasonCode?: string;
	explanation?: string;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId: vendorUserId });
	if (!vendor) throw ErrForbidden;

	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (order.vendorId.toString() !== vendor._id.toString()) throw ErrForbidden;

	if (
		order.status === OrderStatus.AWAITING_VENDOR_ACCEPTANCE &&
		(status === OrderStatus.ACCEPTED ||
			status === OrderStatus.VENDOR_REJECTED) &&
		order.acceptanceDeadline &&
		new Date(order.acceptanceDeadline).getTime() <= Date.now()
	) {
		await expireVendorAcceptanceOrder({ orderId });
		throw acceptanceDeadlineExpired();
	}

	if (
		!isVendorStatusTransitionAllowed(
			order.status as OrderStatus,
			status,
			order.fulfillmentType,
		)
	) {
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
		status === OrderStatus.READY_FOR_PICKUP &&
		order.fulfillmentType !== FulfillmentType.PICKUP
	) {
		throw invalidOrderState(
			"Only pickup orders can be marked ready for pickup.",
		);
	}
	if (
		status === OrderStatus.READY_FOR_DELIVERY &&
		order.fulfillmentType !== FulfillmentType.DELIVERY
	) {
		throw invalidOrderState(
			"Only delivery orders can be marked ready for delivery.",
		);
	}
	if (
		(order.status === OrderStatus.READY ||
			order.status === OrderStatus.READY_FOR_DELIVERY) &&
		status === OrderStatus.COMPLETED &&
		order.fulfillmentType === FulfillmentType.DELIVERY
	) {
		throw invalidOrderState(
			"Delivery orders must be marked in transit before completion.",
		);
	}
	if (
		(order.status === OrderStatus.READY ||
			order.status === OrderStatus.READY_FOR_PICKUP ||
			order.status === OrderStatus.READY_FOR_DELIVERY) &&
		status === OrderStatus.IN_TRANSIT &&
		order.fulfillmentType !== FulfillmentType.DELIVERY
	) {
		throw invalidOrderState("Only delivery orders can move in transit.");
	}
	if (
		status === OrderStatus.IN_TRANSIT &&
		order.status !== OrderStatus.READY_FOR_DELIVERY &&
		order.status !== OrderStatus.READY
	) {
		throw invalidOrderState(
			"Delivery can start only after the order is ready for delivery.",
		);
	}

	if (status === OrderStatus.ACCEPTED) {
		const acceptedAt = new Date();
		const itemPrepMins = order.items
			.map((item) => item.snapshotPrepMin ?? 0)
			.filter((min) => min > 0);
		const expectedPrepMin =
			itemPrepMins.length > 0 ? Math.max(...itemPrepMins) : 20;
		const expectedReadyAt = new Date(
			acceptedAt.getTime() + expectedPrepMin * 60 * 1000,
		);
		const accepted = await setBuyerOrderStatusDB({
			id: orderId,
			status: OrderStatus.ACCEPTED,
			fromStatuses: [OrderStatus.AWAITING_VENDOR_ACCEPTANCE],
			acceptedAt,
			acceptanceDeadline: order.acceptanceDeadline,
			expectedReadyAt,
			expectedPrepMin,
		});
		if (!accepted)
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
		return accepted;
	}

	if (status === OrderStatus.VENDOR_REJECTED) {
		const rejectionReasonCode = reasonCode ?? "VENDOR_REJECTED";
		const rejectionExplanation =
			explanation ?? reason ?? "Vendor rejected this order.";
		const rejected = await setBuyerOrderStatusDB({
			id: orderId,
			status: OrderStatus.VENDOR_REJECTED,
			fromStatuses: [OrderStatus.AWAITING_VENDOR_ACCEPTANCE],
			vendorRejectedAt: new Date(),
			vendorRejectionReasonCode: rejectionReasonCode,
			vendorRejectionExplanation: rejectionExplanation,
		});
		if (!rejected)
			throw invalidOrderState("Order status changed â€” please retry.");

		await setBuyerOrderStatusDB({
			id: orderId,
			status: OrderStatus.REFUND_PENDING,
			fromStatuses: [OrderStatus.VENDOR_REJECTED],
			refundPendingAt: new Date(),
		});

		const refundReason = `${rejectionExplanation} Your refund has started.`;
		let refundOutcome: RefundOutcome | "REFUND_FAILED" = "REFUND_PENDING";
		try {
			const refund = await issueRefund({
				orderId,
				amountKobo: order.totalKobo,
				reason: refundReason,
			});
			refundOutcome = refund.outcome;
		} finally {
			void notifyOrderRefundPending({
				buyerId: order.buyerId.toString(),
				orderNumber: order.orderNumber,
				reason: refundReason,
			}).catch((error) =>
				console.error(
					`[orders] ORDER_REFUND_PENDING notification failed for ${orderId}:`,
					error,
				),
			);
		}
		await recordVendorRejectionEvent({
			orderId,
			orderNumber: order.orderNumber,
			vendorUserId,
			reasonCode: rejectionReasonCode,
			explanation: rejectionExplanation,
			refundOutcome,
		});
		await notifyVendorRejectionParties({
			order,
			vendorUserId,
			reasonCode: rejectionReasonCode,
			explanation: rejectionExplanation,
			refundOutcome,
		});
		return (await getBuyerOrderByIdDB({ id: orderId })) ?? rejected;
	}

	const readyAt =
		status === OrderStatus.READY ||
		status === OrderStatus.READY_FOR_PICKUP ||
		status === OrderStatus.READY_FOR_DELIVERY
			? new Date()
			: undefined;
	const actualPrepMin =
		readyAt && order.acceptedAt
			? Math.max(
					0,
					Math.round(
						(readyAt.getTime() -
							new Date(order.acceptedAt).getTime()) /
							(60 * 1000),
					),
				)
			: undefined;

	const updated = await setBuyerOrderStatusDB({
		id: orderId,
		status,
		fromStatuses: [order.status as OrderStatus],
		readyAt,
		actualPrepMin,
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
	if (
		status === OrderStatus.READY ||
		status === OrderStatus.READY_FOR_PICKUP ||
		status === OrderStatus.READY_FOR_DELIVERY
	) {
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

async function recordVendorRejectionEvent({
	orderId,
	orderNumber,
	vendorUserId,
	reasonCode,
	explanation,
	refundOutcome,
}: {
	orderId: string;
	orderNumber: string;
	vendorUserId: string;
	reasonCode: string;
	explanation: string;
	refundOutcome: string;
}) {
	await appendBuyerOrderTimelineDB({
		id: orderId,
		entry: {
			at: new Date(),
			type: "ORDER_REJECTED_BY_VENDOR",
			actor: "vendor",
			actorId: vendorUserId,
			note: explanation,
			data: {
				orderId,
				orderNumber,
				reasonCode,
				explanation,
				refundOutcome,
			},
		},
	});
}

async function notifyVendorRejectionParties({
	order,
	vendorUserId,
	reasonCode,
	explanation,
	refundOutcome,
}: {
	order: {
		_id: string;
		orderNumber: string;
		buyerId: { toString(): string };
		vendorId: { toString(): string };
	};
	vendorUserId: string;
	reasonCode: string;
	explanation: string;
	refundOutcome: string;
}) {
	await createUserNotification({
		userId: vendorUserId,
		title: "Order rejected",
		body: `You rejected order ${order.orderNumber}.`,
		type: "ORDER_VENDOR_REJECTED",
		dedupeKey: `order:${order.orderNumber}:vendor:rejected`,
		data: {
			orderId: order._id.toString(),
			orderNumber: order.orderNumber,
			reasonCode,
			explanation,
			refundOutcome,
		},
	});
	await notifyAdminAttention({
		kind: "REFUND_REVIEW",
		title: "Vendor rejected order",
		whatHappened: `Order ${order.orderNumber} was rejected by the vendor.`,
		submittedBy: `Vendor user ${vendorUserId}`,
		recordId: order._id.toString(),
		adminPath: `/admin/orders?orderId=${encodeURIComponent(order._id.toString())}`,
		dedupeKey: `order:${order.orderNumber}:admin:vendor-rejected`,
		severity: refundOutcome === "REFUND_FAILED" ? "critical" : "warning",
		category: "ORDER_REJECTION",
		reason: { code: reasonCode, explanation },
		references: {
			orderId: order._id.toString(),
			orderNumber: order.orderNumber,
			buyerId: order.buyerId.toString(),
			vendorId: order.vendorId.toString(),
		},
		actionLabel: "View order",
		email: refundOutcome === "REFUND_FAILED",
	});
}
