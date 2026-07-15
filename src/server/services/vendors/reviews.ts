import {
	getVendorRatingAggregateDB,
	listReviewsWithBuyerByVendorDB,
} from "@/server/models";

export async function getVendorReviews({ vendorId }: { vendorId: string }) {
	const [reviews, aggregate] = await Promise.all([
		listReviewsWithBuyerByVendorDB({ vendorId }),
		getVendorRatingAggregateDB({ vendorId }),
	]);
	return { reviews, aggregate };
}
