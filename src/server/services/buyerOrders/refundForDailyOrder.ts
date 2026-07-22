import {
	getPaymentByOrderIdDB,
	listBuyerOrdersByVendorAndDailyOrderDB,
	markBuyerOrderCancelledDB,
	markPaymentExpiredDB,
	OrderStatus,
} from "../../models";
import { refundBuyerOrder } from "../payments/refundBuyerOrder";
import { releaseSlots } from "./slots";

/**
 * Bulk-refund every still-active paid order attached to a daily order. Called
 * when a vendor cancels a whole listing. Each refund is independent — one
 * failure is logged and does not abort the rest.
 */
export async function refundOrdersForDailyOrder({
	vendorId,
	dailyOrderId,
	reason = "Vendor cancelled this listing.",
}: {
	vendorId: string;
	dailyOrderId: string;
	reason?: string;
}): Promise<{ refunded: number; failed: number }> {
	const orders = await listBuyerOrdersByVendorAndDailyOrderDB({
		vendorId,
		dailyOrderId,
	});
	let refunded = 0;
	let failed = 0;
	const refundableStatuses = [
		OrderStatus.PAID,
		OrderStatus.AWAITING_VENDOR_ACCEPTANCE,
		OrderStatus.ACCEPTED,
		OrderStatus.CONFIRMED,
	];
	for (const order of orders) {
		if (!refundableStatuses.includes(order.status)) {
			continue;
		}
		try {
			const cancelled = await markBuyerOrderCancelledDB({
				id: order._id.toString(),
				reason,
				cancelledBy: "vendor",
				fromStatuses: refundableStatuses,
			});
			if (!cancelled) continue;
			const payment = await getPaymentByOrderIdDB({
				buyerOrderId: order._id.toString(),
			});
			if (payment?.paystackRef) {
				await refundBuyerOrder({
					orderId: order._id.toString(),
					paystackRef: payment.paystackRef,
					amountKobo: order.totalKobo,
				});
				refunded += 1;
			}
		} catch (error) {
			failed += 1;
			console.error(
				`[refundForDailyOrder] failed for order ${order._id}:`,
				error,
			);
		}
	}
	return { refunded, failed };
}

export async function expireExternalPaymentOrdersForDailyOrder({
	vendorId,
	dailyOrderId,
	reason = "Listing closed before external payment was completed.",
}: {
	vendorId: string;
	dailyOrderId: string;
	reason?: string;
}): Promise<number> {
	const orders = await listBuyerOrdersByVendorAndDailyOrderDB({
		vendorId,
		dailyOrderId,
	});
	let expired = 0;
	for (const order of orders) {
		if (order.status !== OrderStatus.AWAITING_EXTERNAL_PAYMENT) continue;
		const cancelled = await markBuyerOrderCancelledDB({
			id: order._id.toString(),
			reason,
			cancelledBy: "system",
			fromStatuses: [OrderStatus.AWAITING_EXTERNAL_PAYMENT],
		});
		if (!cancelled) continue;
		await markPaymentExpiredDB({ buyerOrderId: order._id.toString() });
		await releaseSlots(
			order.items.map((item) => ({
				dailyOrderItemId: item.dailyOrderItemId.toString(),
				quantity: item.quantity,
			})),
		);
		expired += 1;
	}
	return expired;
}
