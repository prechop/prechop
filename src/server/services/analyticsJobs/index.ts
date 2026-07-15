import {
	aggregateVendorDailyReviewStatsDB,
	aggregateVendorDailyStatsDB,
	aggregateVendorLifetimeStatsDB,
	bulkUpdateVendorCompletionRatesDB,
	upsertAnalyticsSnapshotDB,
} from "../../models";
import type { IAnalyticsSnapshotPayload } from "../../models/analyticsSnapshots/types";
import { previousDayWindowInTimezone } from "../../models/utils";

/**
 * Build (or refresh) yesterday's per-vendor analytics snapshot, then refresh
 * every vendor's lifetime completion rate. Run daily just after midnight.
 * Dashboards read these pre-aggregated rows, never live orders.
 *
 * The day is the **Africa/Lagos** calendar day before `reference`, resolved at
 * read time — so the result is identical whether the cron fires at 00:01 Lagos
 * or 00:01 UTC on a UTC host. It is safe to re-run for the same day: every
 * write is an upsert keyed on (vendorId, date).
 *
 * Only vendors with activity (an order created, or a review received) get a
 * snapshot row; writing zero-rows for every idle vendor every night would be
 * landfill. Returns the number of snapshots written.
 */
export async function rebuildDailySnapshots(reference?: Date): Promise<number> {
	const { from, to } = previousDayWindowInTimezone(reference ?? new Date());

	const [stats, reviewStats] = await Promise.all([
		aggregateVendorDailyStatsDB({ from, to }),
		aggregateVendorDailyReviewStatsDB({ from, to }),
	]);

	const statsByVendor = new Map(stats.map((s) => [s.vendorId, s]));
	const reviewsByVendor = new Map(reviewStats.map((r) => [r.vendorId, r]));
	// A vendor can receive a review on a day they took no orders, and vice
	// versa — snapshot the union so neither signal is silently dropped.
	const vendorIds = new Set([
		...statsByVendor.keys(),
		...reviewsByVendor.keys(),
	]);

	let written = 0;
	for (const vendorId of vendorIds) {
		const s = statsByVendor.get(vendorId);
		const r = reviewsByVendor.get(vendorId);
		const totalOrders = s?.totalOrders ?? 0;
		const totalRevenueKobo = s?.totalRevenueKobo ?? 0;

		const payload: IAnalyticsSnapshotPayload = {
			totalOrders,
			completedOrders: s?.completedOrders ?? 0,
			cancelledOrders: s?.cancelledOrders ?? 0,
			totalRevenueKobo,
			// Mean over every order created that day, including cancelled ones
			// that contributed no revenue — the existing definition, kept.
			avgOrderValueKobo:
				totalOrders > 0
					? Math.round(totalRevenueKobo / totalOrders)
					: 0,
			topItemIds: s?.topItemIds ?? [],
			newReviewCount: r?.newReviewCount ?? 0,
		};
		// peakHour and avgRatingForDay are genuinely absent on a day with no
		// settled orders / no reviews. Leave them unset rather than writing 0,
		// which would render as "midnight" and "0 stars".
		if (s?.peakHour !== undefined) payload.peakHour = s.peakHour;
		if (r) payload.avgRatingForDay = r.avgRatingForDay;

		const ok = await upsertAnalyticsSnapshotDB({
			vendorId,
			date: from,
			payload,
		});
		if (ok) written += 1;
	}

	await refreshVendorCompletionRates();
	return written;
}

/**
 * Recompute and persist every vendor's lifetime completion rate — the one
 * writer of `vendorProfiles.completionRate`, which is otherwise stuck at its
 * default of 0 forever.
 *
 * Deliberately not scoped to yesterday's window: an order placed days ago can
 * transition to COMPLETED today, which changes that vendor's lifetime rate even
 * though they had no new orders yesterday. One full recompute per night is a
 * single aggregation pass and cannot drift, whereas incrementing on each status
 * change would.
 *
 * Returns the number of vendor profiles actually modified.
 */
export async function refreshVendorCompletionRates(): Promise<number> {
	const lifetime = await aggregateVendorLifetimeStatsDB();
	if (lifetime.length === 0) return 0;
	return await bulkUpdateVendorCompletionRatesDB({
		rates: lifetime.map((l) => ({
			vendorId: l.vendorId,
			completionRate: l.completionRate,
		})),
	});
}
