import {
	findStalePaidOrdersPastCutoffDB,
	markBuyerOrderCancelledDB,
	OrderStatus,
} from "../../models";
import { createUserNotification } from "../notifications";
import { issueRefund } from "../refunds";

export interface StalePaidSweepResult {
	scanned: number;
	cancelled: number;
	refunded: number;
	failed: number;
}

const REASON = "Vendor did not confirm this order before the cutoff.";

/**
 * `cutoff.enforce` — cron sweep for orders the vendor took money for and then
 * never confirmed.
 *
 * `closeExpiredDailyOrdersDB` only closes the *listing*; the buyer orders
 * underneath it stay in PAID forever. Without this sweep a buyer who pays and
 * is never confirmed gets no food and no refund — the money simply sits with
 * the vendor. This is the reconciler that ends that state.
 *
 * Each order is independent: one failure is logged and the sweep continues, so
 * a single un-refundable order cannot starve every other buyer waiting behind
 * it in the batch.
 */
export async function sweepStalePaidOrders({
	limit = 200,
	now,
}: {
	limit?: number;
	now?: Date;
} = {}): Promise<StalePaidSweepResult> {
	const stale = await findStalePaidOrdersPastCutoffDB({ now, limit });
	const result: StalePaidSweepResult = {
		scanned: stale.length,
		cancelled: 0,
		refunded: 0,
		failed: 0,
	};

	for (const order of stale) {
		try {
			// The conditional write IS the race guard. A vendor confirming at the
			// same moment as this sweep flips PAID → CONFIRMED; `fromStatuses`
			// makes this update a no-op in that case, and only the caller that
			// actually flipped the row proceeds to move money. Dropping this
			// guard would let us refund an order the vendor is already cooking.
			const cancelled = await markBuyerOrderCancelledDB({
				id: order.id,
				reason: REASON,
				cancelledBy: "system",
				fromStatuses: [OrderStatus.PAID],
			});
			if (!cancelled) continue;
			result.cancelled += 1;

			// Capacity is deliberately NOT returned to the listing: its cutoff has
			// already passed, so the slots are worthless and incrementing them
			// would only corrupt the day's numbers.
			const refund = await issueRefund({
				orderId: order.id,
				amountKobo: order.totalKobo,
				reason: REASON,
			});
			if (refund.outcome === "REFUNDED") result.refunded += 1;

			createUserNotification({
				userId: order.buyerId,
				title: "Order refunded",
				body: "Your order was not confirmed before the cutoff, so it was cancelled and your money is on its way back.",
				type: "ORDER_REFUNDED",
				data: { orderId: order.id, amountKobo: order.totalKobo },
			});
		} catch (error) {
			result.failed += 1;
			console.error(
				`[cutoff.enforce] refund failed for order ${order.id}:`,
				error,
			);
		}
	}

	if (result.cancelled || result.failed) {
		console.info(
			`[cutoff.enforce] scanned=${result.scanned} cancelled=${result.cancelled} refunded=${result.refunded} failed=${result.failed}`,
		);
	}
	return result;
}
