import crypto from "node:crypto";
import { CronJob } from "cron";
import { acquireLock, releaseLock } from "../databases";
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
	const { closeExpiredDailyOrdersDB } = await import("../models");
	const { sweepAbandonedOrders } = await import(
		"../services/buyerOrders/sweepAbandoned"
	);
	const { removeExpiredUsersTokens } = await import(
		"../services/auth/removeExpiredUsersTokens"
	);
	const { rebuildDailySnapshots } = await import("../services/analyticsJobs");

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

		// Daily analytics snapshot at 00:01.
		new CronJob(
			"1 0 * * *",
			() => {
				void runSingleInstance("analytics-daily", 600, () =>
					rebuildDailySnapshots(),
				);
			},
			null,
			true,
		);
	} catch (error) {
		console.error("[cron] failed to schedule jobs:", error);
	}
}
