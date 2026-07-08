import {
	getVendorRatingAggregateDB,
	listReviewsByVendorDB,
} from "@/server/models";

export async function getVendorReviews({ vendorId }: { vendorId: string }) {
	const [reviews, aggregate] = await Promise.all([
		listReviewsByVendorDB({ vendorId }),
		getVendorRatingAggregateDB({ vendorId }),
	]);
	return { reviews, aggregate };
}
