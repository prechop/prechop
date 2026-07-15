import {
	findAbandonedBuyerOrderIdsDB,
	findExpiredExternalPaymentOrderIdsDB,
	getBuyerOrderByIdDB,
	markBuyerOrderCancelledDB,
	markPaymentAbandonedDB,
	markPaymentExpiredDB,
	OrderStatus,
} from "../../models";
import { getSiteConfigs } from "../siteConfigs";
import { releaseSlots } from "./slots";

/**
 * Cron sweep: cancel orders stuck in PENDING_PAYMENT past the abandon window,
 * release their slot holds, and mark the payment ABANDONED. No money moved —
 * these never completed payment.
 */
export async function sweepAbandonedOrders(): Promise<number> {
	const config = await getSiteConfigs();
	const ids = await findAbandonedBuyerOrderIdsDB({
		olderThanMinutes: config.abandonedOrderMinutes,
	});
	const externalIds = await findExpiredExternalPaymentOrderIdsDB({
		olderThanMinutes: config.externalPaymentLinkTtlMinutes,
	});
	let cancelled = 0;
	for (const id of [...ids, ...externalIds]) {
		const order = await getBuyerOrderByIdDB({ id });
		if (!order) continue;
		const external = order.status === OrderStatus.AWAITING_EXTERNAL_PAYMENT;
		const done = await markBuyerOrderCancelledDB({
			id,
			reason: external
				? "External payment request expired."
				: "Payment not completed in time.",
			cancelledBy: "system",
			fromStatuses: [
				OrderStatus.PENDING_PAYMENT,
				OrderStatus.AWAITING_EXTERNAL_PAYMENT,
			],
		});
		if (!done) continue;
		if (external) {
			await markPaymentExpiredDB({ buyerOrderId: id });
		} else {
			await markPaymentAbandonedDB({ buyerOrderId: id });
		}
		await releaseSlots(
			order.items.map((i) => ({
				dailyOrderItemId: i.dailyOrderItemId.toString(),
				quantity: i.quantity,
			})),
		);
		cancelled += 1;
	}
	return cancelled;
}
