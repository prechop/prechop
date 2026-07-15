import mongoose from "mongoose";
import { DB_NAME, tryDecrypt } from "../../constants";
import { acquireLock } from "../../databases";
import {
	findDailyOrdersNearCutoffDB,
	getUserByIdWithPhoneDB,
	getVendorProfileByIdDB,
	listBuyerOrdersDB,
	OrderStatus,
} from "../../models";
import { sendchampProvider } from "../../providers";
import { createUserNotification } from "../notifications";
import { getSiteConfigs } from "../siteConfigs";

export interface CutoffWarningResult {
	listingsWarned: number;
	buyersNotified: number;
}

/** Buyers who still have something to lose: money not yet taken, order not yet secured. */
const UNPAID_STATUSES = [
	OrderStatus.PENDING_PAYMENT,
	OrderStatus.AWAITING_EXTERNAL_PAYMENT,
];

/**
 * BR-8 — cutoff warning. `cutoffWarningMinutes` (default 30) before a listing's
 * cutoff, warn the vendor by SMS that ordering is about to close, and nudge any
 * buyer still sitting on an unpaid order for that listing.
 *
 * Idempotency is the whole problem here. This runs every minute while a listing
 * sits inside a 30-minute window, so a naive implementation would send the same
 * buyer 30 SMS/notifications. There is no `warnedAt` column to write, so the
 * dedupe is a Redis `SET NX` per listing whose TTL outlives the window — the
 * first tick to claim a listing is the only one that notifies. The key is
 * intentionally never released: expiry IS the reset.
 *
 * A lost lock (Redis down) means no warning, not a duplicate one — the safe
 * direction for a notification that costs money to send.
 *
 * Listings come from `findDailyOrdersNearCutoffDB`, which asks the operational
 * question — status + cutoffTime only. The previous implementation borrowed
 * `listActiveDailyOrdersByCampusDB`, a *marketplace visibility* query, which
 * additionally filtered `isPublic: true`, `_vendor.isOpenForOrders: true` and
 * `_vendor.status: ACTIVE` and capped at MAX_LIMIT. Whether a listing is
 * publicly browsable has nothing to do with whether its buyers deserve a
 * warning: link-only ("Pay for Me") listings and vendors who toggled the
 * kitchen closed both still have live orders with a real cutoff, and both were
 * silently skipped.
 */
export async function sendCutoffWarnings({
	now = new Date(),
}: {
	now?: Date;
} = {}): Promise<CutoffWarningResult> {
	const config = await getSiteConfigs();
	const warnMinutes = config.cutoffWarningMinutes;
	const result: CutoffWarningResult = {
		listingsWarned: 0,
		buyersNotified: 0,
	};
	// 0 disables the warning entirely — respect that rather than warning at cutoff.
	if (!warnMinutes || warnMinutes <= 0) return result;

	// The query IS the window: `cutoffTime: { $gt: now, $lte: now + warnMinutes }`
	// and ACTIVE + not-deleted are enforced in the model, so no post-filter here.
	const listings = await findDailyOrdersNearCutoffDB({
		withinMinutes: warnMinutes,
		now,
	});

	// Lock outlives the window so a listing is warned once, not once per tick.
	const lockTtlSeconds = warnMinutes * 60 + 300;

	for (const listing of listings) {
		const cutoff = new Date(listing.cutoffTime);
		const listingId = listing._id.toString();
		const claimed = await acquireLock(
			`cron:warned:${DB_NAME}:cutoff:${listingId}`,
			"1",
			lockTtlSeconds,
		);
		if (!claimed) continue;

		try {
			result.buyersNotified += await warnUnpaidBuyers(listingId, cutoff);
			await warnVendor(
				listing.vendorId.toString(),
				listing.title,
				cutoff,
			);
			result.listingsWarned += 1;
		} catch (error) {
			console.error(
				`[cutoff.warning] failed for listing ${listingId}:`,
				error,
			);
		}
	}

	return result;
}

function minutesUntil(cutoff: Date, from: Date = new Date()): number {
	return Math.max(1, Math.round((cutoff.getTime() - from.getTime()) / 60000));
}

async function warnUnpaidBuyers(
	dailyOrderId: string,
	cutoff: Date,
): Promise<number> {
	const orders = await listBuyerOrdersDB({
		filter: {
			dailyOrderId: new mongoose.Types.ObjectId(dailyOrderId),
			status: { $in: UNPAID_STATUSES },
		},
	});
	const mins = minutesUntil(cutoff);
	for (const order of orders) {
		createUserNotification({
			userId: order.buyerId.toString(),
			title: "Ordering closes soon",
			body: `Ordering for ${order.orderNumber} closes in about ${mins} minutes. Complete your payment before then or the order will be cancelled.`,
			type: "CUTOFF_WARNING",
			data: { orderNumber: order.orderNumber, cutoffTime: cutoff },
		});
	}
	return orders.length;
}

async function warnVendor(
	vendorId: string,
	title: string,
	cutoff: Date,
): Promise<void> {
	const vendor = await getVendorProfileByIdDB({ id: vendorId });
	if (!vendor) return;
	const user = await getUserByIdWithPhoneDB({ id: vendor.userId.toString() });
	const phone = user?.phone ? tryDecrypt(user.phone) : "";
	if (!phone) return;
	// Fire-and-forget: an SMS failure must not abort the buyer warnings or the
	// rest of the sweep.
	sendchampProvider
		.sendCustom(
			phone,
			`PreChop: ordering for "${title}" closes in about ${minutesUntil(cutoff)} minutes.`,
		)
		.catch(() => {});
}
