import {
	countBuyerOrdersDB,
	countVendorsDB,
	listVendorsDB,
	OrderStatus,
	VendorStatus,
} from "../../models";

/** Platform-wide summary for the admin dashboard. */
export async function getPlatformAnalytics() {
	const [totalVendors, activeVendors, totalPaidOrders, topVendors] =
		await Promise.all([
			countVendorsDB(),
			countVendorsDB({ filter: { status: VendorStatus.ACTIVE } }),
			countBuyerOrdersDB({
				filter: {
					status: {
						$in: [
							OrderStatus.PAID,
							OrderStatus.CONFIRMED,
							OrderStatus.PREPARING,
							OrderStatus.READY,
							OrderStatus.COMPLETED,
						],
					},
				},
			}),
			// listVendorsDB already sorts by rating desc, then totalOrders desc.
			listVendorsDB({ status: VendorStatus.ACTIVE, limit: 5 }),
		]);

	return {
		totalVendors,
		activeVendors,
		totalPaidOrders,
		topVendors: topVendors.map((v) => ({
			id: v.id ?? v._id.toString(),
			businessName: v.businessName ?? null,
			rating: v.rating,
			totalOrders: v.totalOrders,
			totalReviews: v.totalReviews,
		})),
	};
}
