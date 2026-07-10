import {
	ErrForbidden,
	ErrOrderNotCancellable,
	ErrOrderNotFound,
	tryDecrypt,
} from "../../constants";
import {
	decrementDailyOrderItemQuantityDB,
	getBuyerOrderByIdDB,
	getPaymentByOrderIdDB,
	getUserByIdWithPhoneDB,
	getVendorProfileByUserIdDB,
	markBuyerOrderCancelledDB,
	OrderStatus,
} from "../../models";
import { sendchampProvider } from "../../providers";
import { refundBuyerOrder } from "../payments/refundBuyerOrder";

const CANCELLABLE: OrderStatus[] = [OrderStatus.PAID, OrderStatus.CONFIRMED];

export async function cancelOrderAsBuyer({
	buyerId,
	orderId,
	reason,
}: {
	buyerId: string;
	orderId: string;
	reason: string;
}) {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (order.buyerId.toString() !== buyerId) throw ErrForbidden;
	if (!CANCELLABLE.includes(order.status as OrderStatus))
		throw ErrOrderNotCancellable;

	const cancelled = await markBuyerOrderCancelledDB({
		id: orderId,
		reason,
		cancelledBy: "buyer",
		fromStatuses: CANCELLABLE,
	});
	// Only the caller that actually flipped the status runs the side-effects, so
	// a concurrent double-cancel can neither double-refund nor double-return
	// capacity. A lost race means someone else already cancelled it.
	if (!cancelled) throw ErrOrderNotCancellable;

	await returnCapacity(order);
	await refundOrder(order);

	return {
		message:
			"Order cancelled. Refund will be processed within 5–10 business days.",
	};
}

export async function cancelOrderAsVendor({
	vendorUserId,
	orderId,
	reason,
}: {
	vendorUserId: string;
	orderId: string;
	reason: string;
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
		cancelledBy: "vendor",
		fromStatuses: CANCELLABLE,
	});
	if (!cancelled) throw ErrOrderNotCancellable;

	await returnCapacity(order);
	await refundOrder(order);

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

async function refundOrder(order: {
	_id: string;
	totalKobo: number;
}): Promise<void> {
	const payment = await getPaymentByOrderIdDB({
		buyerOrderId: order._id.toString(),
	});
	if (payment?.paystackRef) {
		await refundBuyerOrder({
			orderId: order._id.toString(),
			paystackRef: payment.paystackRef,
			amountKobo: order.totalKobo,
		});
	}
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
