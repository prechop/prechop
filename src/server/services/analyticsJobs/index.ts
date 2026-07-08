import {
	aggregateVendorDailyStatsDB,
	upsertAnalyticsSnapshotDB,
} from "../../models";

/**
 * Build (or refresh) yesterday's per-vendor analytics snapshot. Run daily at
 * 00:01. Reads from buyerOrders and writes one snapshot per active vendor so
 * dashboards read pre-aggregated data, never live scans.
 */
export async function rebuildDailySnapshots(reference?: Date): Promise<number> {
	const now = reference ?? new Date();
	const to = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);

	const stats = await aggregateVendorDailyStatsDB({ from, to });
	let written = 0;
	for (const s of stats) {
		const avgOrderValueKobo =
			s.totalOrders > 0
				? Math.round(s.totalRevenueKobo / s.totalOrders)
				: 0;
		const ok = await upsertAnalyticsSnapshotDB({
			vendorId: s.vendorId,
			date: from,
			payload: {
				totalOrders: s.totalOrders,
				completedOrders: s.completedOrders,
				cancelledOrders: s.cancelledOrders,
				totalRevenueKobo: s.totalRevenueKobo,
				avgOrderValueKobo,
			},
		});
		if (ok) written += 1;
	}
	return written;
}
