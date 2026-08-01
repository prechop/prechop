import {
	ErrForbidden,
	ErrOrderNotCancellable,
	ErrOrderNotFound,
	tryDecrypt,
} from "../../constants";
import {
	appendBuyerOrderTimelineDB,
	decrementDailyOrderItemQuantityDB,
	getBuyerOrderByIdDB,
	getPaymentByOrderIdDB,
	getUserByIdWithPhoneDB,
	getVendorProfileByIdDB,
	getVendorProfileByUserIdDB,
	markBuyerOrderCancelledDB,
	markPaymentCancelledDB,
	OrderStatus,
} from "../../models";
import { sendchampProvider } from "../../providers";
import { createUserNotification, notifyAdminAttention } from "../notifications";
import type { RefundOutcome } from "../refunds";
import { refundBuyerOrder } from "../payments/refundBuyerOrder";
import { releaseSlots } from "./slots";

const CANCELLABLE: OrderStatus[] = [
	OrderStatus.AWAITING_EXTERNAL_PAYMENT,
	OrderStatus.PAID,
	OrderStatus.AWAITING_VENDOR_ACCEPTANCE,
	OrderStatus.ACCEPTED,
	OrderStatus.CONFIRMED,
];

const LATE_BUYER_CANCELLABLE: OrderStatus[] = [
	OrderStatus.ACCEPTED,
	OrderStatus.CONFIRMED,
	OrderStatus.COOKING,
	OrderStatus.PREPARING,
];

export async function cancelOrderAsBuyer({
	buyerId,
	orderId,
	reason,
	reasonCode,
	explanation,
}: {
	buyerId: string;
	orderId: string;
	reason: string;
	reasonCode?: string;
	explanation?: string;
}) {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (order.buyerId.toString() !== buyerId) throw ErrForbidden;
	const fromStatuses = buyerCancellableStatuses(order);
	if (!fromStatuses.includes(order.status as OrderStatus))
		throw ErrOrderNotCancellable;

	const cancelled = await markBuyerOrderCancelledDB({
		id: orderId,
		reason,
		reasonCode: reasonCode ?? "BUYER_CANCELLED",
		explanation: explanation ?? reason,
		cancelledBy: "buyer",
		fromStatuses,
	});
	// Only the caller that actually flipped the status runs the side-effects, so
	// a concurrent double-cancel can neither double-refund nor double-return
	// capacity. A lost race means someone else already cancelled it.
	if (!cancelled) throw ErrOrderNotCancellable;

	let outcome: CancellationPaymentOutcome;
	if (order.status === OrderStatus.AWAITING_EXTERNAL_PAYMENT) {
		await releaseHeldCapacity(order);
		await markPaymentCancelledDB({ buyerOrderId: orderId });
		outcome = "PAYMENT_CANCELLED";
	} else {
		await returnCapacity(order);
		outcome = await refundOrder(order);
	}
	await recordCancellationEvent({
		orderId,
		orderNumber: order.orderNumber,
		actor: "buyer",
		actorId: buyerId,
		reasonCode: reasonCode ?? "BUYER_CANCELLED",
		explanation: explanation ?? reason,
		outcome,
	});
	await notifyVendorBuyerCancelled(order, reason);
	await notifyAdminCancellation({
		order,
		actor: "buyer",
		actorId: buyerId,
		reasonCode: reasonCode ?? "BUYER_CANCELLED",
		explanation: explanation ?? reason,
		outcome,
	});

	return {
		message:
			"Order cancelled. Refund will be processed within 5–10 business days.",
	};
}

function buyerCancellableStatuses(order: {
	status: string;
	lateMarkedAt?: Date;
}): OrderStatus[] {
	if (
		order.lateMarkedAt &&
		LATE_BUYER_CANCELLABLE.includes(order.status as OrderStatus)
	) {
		return Array.from(new Set([...CANCELLABLE, ...LATE_BUYER_CANCELLABLE]));
	}
	return CANCELLABLE;
}

export async function cancelOrderAsVendor({
	vendorUserId,
	orderId,
	reason,
	reasonCode,
	explanation,
}: {
	vendorUserId: string;
	orderId: string;
	reason: string;
	reasonCode?: string;
	explanation?: string;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId: vendorUserId });
	if (!vendor) throw ErrForbidden;

	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (order.vendorId.toString() !== vendor._id.toString()) throw ErrForbidden;
	if (!CANCELLABLE.includes(order.status as OrderStatus))
		throw ErrOrderNotCancellable;

	const cancelled = await markBuyerOrderCancelledDB({
		id: orderId,
		reason,
		reasonCode: reasonCode ?? "VENDOR_CANCELLED",
		explanation: explanation ?? reason,
		cancelledBy: "vendor",
		fromStatuses: CANCELLABLE,
	});
	if (!cancelled) throw ErrOrderNotCancellable;

	let outcome: CancellationPaymentOutcome;
	if (order.status === OrderStatus.AWAITING_EXTERNAL_PAYMENT) {
		await releaseHeldCapacity(order);
		await markPaymentCancelledDB({ buyerOrderId: orderId });
		outcome = "PAYMENT_CANCELLED";
	} else {
		await returnCapacity(order);
		outcome = await refundOrder(order);
	}
	await recordCancellationEvent({
		orderId,
		orderNumber: order.orderNumber,
		actor: "vendor",
		actorId: vendorUserId,
		reasonCode: reasonCode ?? "VENDOR_CANCELLED",
		explanation: explanation ?? reason,
		outcome,
	});
	await notifyAdminCancellation({
		order,
		actor: "vendor",
		actorId: vendorUserId,
		reasonCode: reasonCode ?? "VENDOR_CANCELLED",
		explanation: explanation ?? reason,
		outcome,
	});

	// Notify the buyer by SMS (fire-and-forget).
	const buyer = await getUserByIdWithPhoneDB({
		id: order.buyerId.toString(),
	});
	const phone = buyer?.phone ? tryDecrypt(buyer.phone) : "";
	if (phone) {
		sendchampProvider
			.sendOrderCancelled(
				phone,
				order.orderNumber,
				"Your refund will be processed within 5–10 business days.",
			)
			.catch(() => {});
	}

	return { message: "Order cancelled and buyer notified." };
}

type CancellationPaymentOutcome = RefundOutcome | "PAYMENT_CANCELLED" | "NO_REFUND";

async function recordCancellationEvent({
	orderId,
	orderNumber,
	actor,
	actorId,
	reasonCode,
	explanation,
	outcome,
}: {
	orderId: string;
	orderNumber: string;
	actor: "buyer" | "vendor";
	actorId: string;
	reasonCode: string;
	explanation: string;
	outcome: CancellationPaymentOutcome;
}) {
	await appendBuyerOrderTimelineDB({
		id: orderId,
		entry: {
			at: new Date(),
			type:
				actor === "buyer"
					? "ORDER_CANCELLED_BY_BUYER"
					: "ORDER_CANCELLED_BY_VENDOR",
			actor,
			actorId,
			note: explanation,
			data: {
				orderId,
				orderNumber,
				reasonCode,
				explanation,
				paymentOutcome: outcome,
			},
		},
	});
}

async function notifyAdminCancellation({
	order,
	actor,
	actorId,
	reasonCode,
	explanation,
	outcome,
}: {
	order: {
		_id: string;
		orderNumber: string;
		buyerId: { toString(): string };
		vendorId: { toString(): string };
	};
	actor: "buyer" | "vendor";
	actorId: string;
	reasonCode: string;
	explanation: string;
	outcome: CancellationPaymentOutcome;
}) {
	await notifyAdminAttention({
		kind: actor === "buyer" ? "REFUND_REVIEW" : "SYSTEM_MANUAL_REVIEW",
		title:
			actor === "buyer"
				? "Buyer cancelled order"
				: "Vendor cancelled order",
		whatHappened: `Order ${order.orderNumber} was cancelled by the ${actor}.`,
		submittedBy: `${actor} ${actorId}`,
		recordId: order._id.toString(),
		adminPath: `/admin/orders?orderId=${encodeURIComponent(order._id.toString())}`,
		dedupeKey: `order:${order.orderNumber}:admin:${actor}-cancelled`,
		severity: outcome === "REFUND_FAILED" ? "critical" : "warning",
		category: "ORDER_CANCELLATION",
		reason: { code: reasonCode, explanation },
		references: {
			orderId: order._id.toString(),
			orderNumber: order.orderNumber,
			buyerId: order.buyerId.toString(),
			vendorId: order.vendorId.toString(),
		},
		actionLabel: "View order",
		email: outcome === "REFUND_FAILED",
	});
}

async function notifyVendorBuyerCancelled(
	order: {
		_id: string;
		orderNumber: string;
		vendorId: { toString(): string };
	},
	reason: string,
): Promise<void> {
	try {
		const vendor = await getVendorProfileByIdDB({
			id: order.vendorId.toString(),
		});
		if (!vendor?.userId) return;
		await createUserNotification({
			userId: vendor.userId.toString(),
			title: "Order cancelled by buyer",
			body: `Order ${order.orderNumber} was cancelled by the buyer.`,
			type: "ORDER_BUYER_CANCELLED",
			dedupeKey: `order:${order.orderNumber}:vendor:buyer-cancelled`,
			data: {
				orderId: order._id.toString(),
				orderNumber: order.orderNumber,
				reason: reason.trim() || undefined,
			},
		});
	} catch (error) {
		console.error(
			`[orders] vendor buyer-cancelled notification failed order=${order._id.toString()} vendorProfileId=${order.vendorId.toString()}:`,
			error,
		);
	}
}

async function refundOrder(order: {
	_id: string;
	totalKobo: number;
}): Promise<CancellationPaymentOutcome> {
	const payment = await getPaymentByOrderIdDB({
		buyerOrderId: order._id.toString(),
	});
	if (payment?.paystackRef) {
		const result = await refundBuyerOrder({
			orderId: order._id.toString(),
			paystackRef: payment.paystackRef,
			amountKobo: order.totalKobo,
		});
		return result.outcome;
	}
	return "NO_REFUND";
}

/**
 * Return a settled order's capacity to its listing. PAID/CONFIRMED orders had
 * their capacity committed to `orderedQuantity` (the Redis reservation was
 * already dropped at payment), so cancellation decrements orderedQuantity — it
 * must NOT touch the reserved counter, which tracks only in-flight holds.
 */
async function returnCapacity(order: {
	dailyOrderId: { toString(): string };
	items: Array<{
		dailyOrderItemId: { toString(): string };
		quantity: number;
	}>;
}): Promise<void> {
	const dailyOrderId = order.dailyOrderId.toString();
	await Promise.allSettled(
		order.items.map((i) =>
			decrementDailyOrderItemQuantityDB({
				dailyOrderId,
				dailyOrderItemId: i.dailyOrderItemId.toString(),
				by: i.quantity,
			}),
		),
	);
}

async function releaseHeldCapacity(order: {
	_id: { toString(): string };
	items: Array<{
		dailyOrderItemId: { toString(): string };
		quantity: number;
	}>;
}): Promise<void> {
	await releaseSlots(
		order.items.map((item) => ({
			dailyOrderItemId: item.dailyOrderItemId.toString(),
			quantity: item.quantity,
		})),
		order._id.toString(),
	);
}
