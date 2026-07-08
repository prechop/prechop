import {
	getPaymentByOrderIdDB,
	listBuyerOrdersByVendorAndDailyOrderDB,
} from "../../models";
import { refundBuyerOrder } from "../payments/refundBuyerOrder";

/**
 * Bulk-refund every still-active paid order attached to a daily order. Called
 * when a vendor cancels a whole listing. Each refund is independent — one
 * failure is logged and does not abort the rest.
 */
export async function refundOrdersForDailyOrder({
	vendorId,
	dailyOrderId,
}: {
	vendorId: string;
	dailyOrderId: string;
}): Promise<{ refunded: number; failed: number }> {
	const orders = await listBuyerOrdersByVendorAndDailyOrderDB({
		vendorId,
		dailyOrderId,
	});
	let refunded = 0;
	let failed = 0;
	for (const order of orders) {
		try {
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
