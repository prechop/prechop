import { ErrVendorNotFound } from "../../constants";
import {
	getVendorProfileByUserIdDB,
	listSnapshotsByVendorDB,
} from "../../models";
import type { IAnalyticsSnapshot } from "../../models/analyticsSnapshots/types";

export interface VendorAnalytics {
	snapshots: IAnalyticsSnapshot[];
	lifetime: {
		totalOrders: number;
		rating: number;
		totalReviews: number;
		completionRate: number;
	};
}

/**
 * Vendor analytics for the authenticated vendor: persisted daily snapshots plus
 * lifetime totals read straight off the vendor profile. Never aggregates live.
 */
export async function getVendorAnalytics({
	userId,
}: {
	userId: string;
}): Promise<VendorAnalytics> {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrVendorNotFound;

	const vendorId = (vendor.id ?? vendor._id)?.toString();
	const snapshots = await listSnapshotsByVendorDB({ vendorId });

	return {
		snapshots,
		lifetime: {
			totalOrders: vendor.totalOrders,
			rating: vendor.rating,
			totalReviews: vendor.totalReviews,
			completionRate: vendor.completionRate,
		},
	};
}
