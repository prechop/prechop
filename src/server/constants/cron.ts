import crypto from "node:crypto";
import { CronJob } from "cron";
import { acquireLock, releaseLock } from "../databases";
import { PLATFORM_TIMEZONE } from "../models/utils";
import { DB_NAME } from "./environments";

declare global {
	// eslint-disable-next-line no-var
	var __prechopCronInit: boolean | undefined;
}

// Unique per-process token so the single-instance lock can be safely released
// only by the instance that acquired it.
const INSTANCE_ID = `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;

/**
 * Run `fn` at most once across all app instances for this tick. Under
 * horizontal scaling every instance fires the same cron schedule; the Redis
 * lock ensures the work runs once. See docs delivery/05-ops-runbook + ADR-002.
 */
async function runSingleInstance(
	job: string,
	ttlSeconds: number,
	fn: () => Promise<unknown>,
): Promise<void> {
	const key = `cron:lock:${DB_NAME}:${job}`;
	const got = await acquireLock(key, INSTANCE_ID, ttlSeconds);
	if (!got) return;
	try {
		await fn();
	} catch (error) {
		console.error(`[cron] job "${job}" failed:`, error);
	} finally {
		await releaseLock(key, INSTANCE_ID);
	}
}

export default async function cron(): Promise<void> {
	if (global.__prechopCronInit) return;
	global.__prechopCronInit = true;

	// Lazy imports so cron scheduling never pulls service graphs at module load.
	const { closeExpiredDailyOrdersDB, resetSoldOutMenuItemsDB } = await import(
		"../models"
	);
	const { sweepAbandonedOrders } = await import(
		"../services/buyerOrders/sweepAbandoned"
	);
	const { sweepStalePaidOrders } = await import(
		"../services/buyerOrders/sweepStalePaidOrders"
	);
	const { sweepVendorAcceptanceDeadlines } = await import(
		"../services/buyerOrders/vendorAcceptance"
	);
	const { sweepPickupNoShowTimers } = await import(
		"../services/buyerOrders/exceptions"
	);
	const { sendCutoffWarnings } = await import(
		"../services/buyerOrders/cutoffWarning"
	);
	const { removeExpiredUsersTokens } = await import(
		"../services/auth/removeExpiredUsersTokens"
	);
	const { rebuildDailySnapshots } = await import("../services/analyticsJobs");
	const { sendDueReviewPrompts } = await import(
		"../services/notifications/reviewPrompts"
	);

	try {
		// Cutoff sweep — close ACTIVE listings past their cutoff. Every minute.
		new CronJob(
			"*/1 * * * *",
			() => {
				void runSingleInstance(
					"cutoff-sweep",
					50,
					closeExpiredDailyOrdersDB,
				);
			},
			null,
			true,
		);

		// Expired refresh-token cleanup. Every minute.
		new CronJob(
			"*/1 * * * *",
			() => {
				void runSingleInstance(
					"token-cleanup",
					50,
					removeExpiredUsersTokens,
				);
			},
			null,
			true,
		);

		// Abandoned-order sweep — cancel unpaid holds, release slots. Every 5 min.
		new CronJob(
			"*/5 * * * *",
			() => {
				void runSingleInstance(
					"abandoned-sweep",
					280,
					sweepAbandonedOrders,
				);
			},
			null,
			true,
		);

		// cutoff.enforce — cancel + refund orders the vendor took money for and
		// never confirmed before cutoff. Every 5 min.
		//
		// The listing-closing sweep above only touches the *listing*; without
		// this, a PAID-but-unconfirmed buyer order sits forever — no food, no
		// refund. TTL is 280s so a slow batch (each order is a Paystack round
		// trip) holds the lock for its whole run rather than letting the next
		// tick start a second, overlapping sweep.
		new CronJob(
			"*/5 * * * *",
			() => {
				void runSingleInstance("cutoff-enforce", 280, () =>
					sweepStalePaidOrders(),
				);
			},
			null,
			true,
			PLATFORM_TIMEZONE,
		);

		new CronJob(
			"*/1 * * * *",
			() => {
				void runSingleInstance("vendor-acceptance", 50, () =>
					sweepVendorAcceptanceDeadlines(),
				);
			},
			null,
			true,
			PLATFORM_TIMEZONE,
		);

		new CronJob(
			"*/1 * * * *",
			() => {
				void runSingleInstance("pickup-noshow", 50, () =>
					sweepPickupNoShowTimers(),
				);
			},
			null,
			true,
			PLATFORM_TIMEZONE,
		);

		// cutoff.warning (BR-8) — pre-cutoff notice to buyers + vendor. Every min.
		// Per-listing Redis dedupe inside the service stops the 30 ticks inside
		// the window from sending 30 notifications.
		new CronJob(
			"*/1 * * * *",
			() => {
				void runSingleInstance("cutoff-warning", 50, () =>
					sendCutoffWarnings(),
				);
			},
			null,
			true,
		);

		// review.prompt — nudge buyers 24h after collection. Hourly.
		//
		// Hourly, not per-minute: the trigger is "24h after the order completed",
		// a deadline nobody perceives to the minute, and each tick is a scan.
		// The service is idempotent via a Redis SET NX per order and no-ops
		// entirely when `reviewsEnabled` is false, so a missed or repeated tick
		// costs nothing. TTL 3000s < the 3600s gap between ticks: a crashed
		// instance's lock always expires before the next tick, so a dead holder
		// can never silently skip an hour.
		//
		// Timezone is load-bearing for the same reason as the jobs below: the
		// sweep's lookback window is reasoned about in Lagos time.
		new CronJob(
			"0 * * * *",
			() => {
				void runSingleInstance("review-prompts", 3000, () =>
					sendDueReviewPrompts(),
				);
			},
			null,
			true,
			PLATFORM_TIMEZONE,
		);

		// Nightly sold-out reset — every item goes back on sale at Lagos midnight.
		//
		// The timezone argument is load-bearing, not decoration: `cron` schedules
		// in the SERVER's local time by default, so on a UTC host this fires at
		// 01:00 Lagos and every sold-out item stays dark through the first hour
		// of trading. No args = all campuses in one write.
		new CronJob(
			"0 0 * * *",
			() => {
				void runSingleInstance("soldout-reset", 300, () =>
					resetSoldOutMenuItemsDB(),
				);
			},
			null,
			true,
			PLATFORM_TIMEZONE,
		);

		// Daily analytics snapshot at 00:01 Lagos. Same timezone reasoning as
		// above — "00:01" is meant to be the start of the Nigerian day, and the
		// snapshot it rebuilds is bucketed in Lagos time, so running it at 00:01
		// UTC would close the previous day an hour early.
		new CronJob(
			"1 0 * * *",
			() => {
				void runSingleInstance("analytics-daily", 600, () =>
					rebuildDailySnapshots(),
				);
			},
			null,
			true,
			PLATFORM_TIMEZONE,
		);
	} catch (error) {
		console.error("[cron] failed to schedule jobs:", error);
	}
}
