import { ErrVendorNotFound } from "../../constants";
import {
	aggregateVendorEarningsStatsDB,
	getVendorProfileByUserIdDB,
	listReviewsWithBuyerByVendorDB,
} from "../../models";
import type { IVendorEarningsDay } from "../../models/buyerOrders";
import type { IReviewWithBuyer } from "../../models/reviews";

export interface VendorAnalytics {
	snapshots: IVendorEarningsDay[];
	lifetime: {
		totalOrders: number;
		completedOrders: number;
		cancelledOrders: number;
		totalRevenueKobo: number;
		totalFoodSubtotalKobo: number;
		totalCommissionKobo: number;
		totalDeliveryEarningsKobo: number;
		totalVendorSettlementKobo: number;
		avgOrderValueKobo: number;
		rating: number;
		totalReviews: number;
		completionRate: number;
	};
	reviews: IReviewWithBuyer[];
}

/** Vendor analytics for the authenticated vendor, computed from resolved orders. */
export async function getVendorAnalytics({
	userId,
}: {
	userId: string;
}): Promise<VendorAnalytics> {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrVendorNotFound;

	const vendorId = (vendor.id ?? vendor._id)?.toString();
	const [earnings, reviews] = await Promise.all([
		aggregateVendorEarningsStatsDB({ vendorId }),
		listReviewsWithBuyerByVendorDB({ vendorId, limit: 100 }),
	]);

	return {
		snapshots: earnings.days,
		lifetime: {
			totalOrders: earnings.totalOrders,
			completedOrders: earnings.completedOrders,
			cancelledOrders: earnings.cancelledOrders,
			totalRevenueKobo: earnings.totalRevenueKobo,
			totalFoodSubtotalKobo: earnings.totalFoodSubtotalKobo,
			totalCommissionKobo: earnings.totalCommissionKobo,
			totalDeliveryEarningsKobo: earnings.totalDeliveryEarningsKobo,
			totalVendorSettlementKobo: earnings.totalVendorSettlementKobo,
			avgOrderValueKobo: earnings.avgOrderValueKobo,
			rating: vendor.rating,
			totalReviews: vendor.totalReviews,
			completionRate: earnings.completionRate,
		},
		reviews,
	};
}
