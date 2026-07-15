import { DB_NAME } from "../../constants";
import { acquireLock } from "../../databases";
import {
	getReviewByOrderDB,
	getVendorProfileByIdDB,
	listBuyerOrdersDB,
	OrderStatus,
} from "../../models";
import { getSiteConfigs } from "../siteConfigs";
import { createUserNotification } from "./createUserNotification";

export interface ReviewPromptResult {
	scanned: number;
	prompted: number;
}

/** Nudge the buyer this long after their order completes. */
const PROMPT_AFTER_HOURS = 24;
/**
 * How far back each sweep looks. Wider than the hourly cadence on purpose: a
 * missed tick (deploy, restart, lock contention) would otherwise skip those
 * orders forever, since the window would have moved past them. The Redis claim
 * below makes the overlap harmless.
 */
const SWEEP_LOOKBACK_HOURS = 6;
/** Outlives the lookback window so an order is claimed once, not once per tick. */
const CLAIM_TTL_SECONDS = (SWEEP_LOOKBACK_HOURS + 24) * 60 * 60;

/**
 * 24-hour review prompt (PRD). Ask buyers to review an order a day after it
 * completed — late enough that they've eaten, early enough to remember.
 *
 * **Why a cron sweep and not a delayed job:** BullMQ was removed, so nothing in
 * this codebase can schedule "run once, 24h from now". Rather than reintroduce a
 * queue for one nudge, this is an idempotent sweep over a time window — the same
 * shape as `sendCutoffWarnings`. Register it on an hourly schedule; see HANDOFF.
 *
 * Idempotency is the crux: this runs repeatedly over an overlapping window, so
 * the naive version texts the same buyer every hour. There is no `promptedAt`
 * column to write (models/** is not this slice's to change), so the dedupe is a
 * Redis `SET NX` per order whose TTL outlives the window. A lost claim means no
 * prompt rather than a duplicate — the safe direction for an unsolicited nudge.
 *
 * In-app + push only, deliberately **not** SMS: the PRD marks order-confirmed
 * and order-ready as SMS, not this. Paying Sendchamp to nag someone for a
 * review is a good way to get a brand marked as spam.
 */
export async function sendDueReviewPrompts({
	now = new Date(),
}: {
	now?: Date;
} = {}): Promise<ReviewPromptResult> {
	const result: ReviewPromptResult = { scanned: 0, prompted: 0 };

	const config = await getSiteConfigs();
	// Don't solicit reviews the product has switched off.
	if (!config.reviewsEnabled) return result;

	const hourMs = 60 * 60 * 1000;
	const dueBefore = new Date(now.getTime() - PROMPT_AFTER_HOURS * hourMs);
	const dueAfter = new Date(
		dueBefore.getTime() - SWEEP_LOOKBACK_HOURS * hourMs,
	);

	// `updatedAt` is the completion timestamp proxy — the same signal
	// `createReview` uses to police the review window. There is no dedicated
	// `completedAt`; see HANDOFF, this is approximate if an order is touched
	// after completion.
	const orders = await listBuyerOrdersDB({
		filter: {
			status: OrderStatus.COMPLETED,
			updatedAt: { $gte: dueAfter, $lt: dueBefore },
		},
	});
	result.scanned = orders.length;

	for (const order of orders) {
		const orderId = String(order.id ?? order._id);
		try {
			// Never prompt someone who already reviewed.
			const existing = await getReviewByOrderDB({
				buyerOrderId: orderId,
			});
			if (existing) continue;

			// Pointless to ask once the window has shut — createReview would
			// reject them with ErrReviewWindowExpired.
			const windowClosesAt =
				new Date(order.updatedAt).getTime() +
				config.reviewWindowHours * hourMs;
			if (windowClosesAt <= now.getTime()) continue;

			const claimed = await acquireLock(
				`cron:prompted:${DB_NAME}:review:${orderId}`,
				"1",
				CLAIM_TTL_SECONDS,
			);
			if (!claimed) continue;

			const vendor = await getVendorProfileByIdDB({
				id: order.vendorId.toString(),
			});
			const vendorName = vendor?.businessName ?? "the kitchen";

			await createUserNotification({
				userId: order.buyerId.toString(),
				title: "How was your order?",
				body: `Rate your order ${order.orderNumber} from ${vendorName}. It takes a few seconds and helps other students choose.`,
				type: "REVIEW_PROMPT",
				data: {
					buyerOrderId: orderId,
					orderNumber: order.orderNumber,
					vendorId: order.vendorId.toString(),
				},
			});
			result.prompted += 1;
		} catch (error) {
			// One bad order must not abort the sweep for everyone else.
			console.error(
				`[review.prompt] failed for order ${orderId}:`,
				error,
			);
		}
	}

	return result;
}
