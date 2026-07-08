import {
	findAbandonedBuyerOrderIdsDB,
	getBuyerOrderByIdDB,
	markBuyerOrderCancelledDB,
	markPaymentAbandonedDB,
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
	let cancelled = 0;
	for (const id of ids) {
		const order = await getBuyerOrderByIdDB({ id });
		if (!order) continue;
		const done = await markBuyerOrderCancelledDB({
			id,
			reason: "Payment not completed in time.",
			cancelledBy: "system",
			fromStatuses: [OrderStatus.PENDING_PAYMENT],
		});
		if (!done) continue;
		await markPaymentAbandonedDB({ buyerOrderId: id });
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
