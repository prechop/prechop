import {
	ErrForbidden,
	ErrOrderNotCancellable,
	ErrOrderNotFound,
	tryDecrypt,
} from "../../constants";
import {
	getBuyerOrderByIdDB,
	getPaymentByOrderIdDB,
	getUserByIdWithPhoneDB,
	getVendorProfileByUserIdDB,
	markBuyerOrderCancelledDB,
	OrderStatus,
} from "../../models";
import { sendchampProvider } from "../../providers";
import { refundBuyerOrder } from "../payments/refundBuyerOrder";
import { releaseSlots } from "./slots";

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

	await markBuyerOrderCancelledDB({
		id: orderId,
		reason,
		cancelledBy: "buyer",
		fromStatuses: CANCELLABLE,
	});
	await releaseHolds(order);
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

	await markBuyerOrderCancelledDB({
		id: orderId,
		reason,
		cancelledBy: "vendor",
		fromStatuses: CANCELLABLE,
	});
	await releaseHolds(order);
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

async function releaseHolds(order: {
	items: Array<{ dailyOrderItemId: string; quantity: number }>;
}): Promise<void> {
	await releaseSlots(
		order.items.map((i) => ({
			dailyOrderItemId: i.dailyOrderItemId.toString(),
			quantity: i.quantity,
		})),
	);
}
