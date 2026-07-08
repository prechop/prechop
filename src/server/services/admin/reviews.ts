import { notFound } from "../../constants";
import {
	deleteReviewDB,
	getVendorRatingAggregateDB,
	listFlaggedReviewsDB,
	unflagReviewDB,
	updateVendorRatingDB,
} from "../../models";

export function listFlaggedReviews() {
	return listFlaggedReviewsDB({});
}

export async function deleteReview(id: string) {
	const deleted = await deleteReviewDB({ id });
	if (!deleted) throw notFound("Review");

	// Recompute the vendor's rating aggregate now that a review is gone.
	const vendorId = deleted.vendorId.toString();
	const aggregate = await getVendorRatingAggregateDB({ vendorId });
	await updateVendorRatingDB({
		id: vendorId,
		rating: aggregate.avg,
		totalReviews: aggregate.count,
	});

	return deleted;
}

export async function unflagReview(id: string) {
	const success = await unflagReviewDB({ id });
	if (!success) throw notFound("Review");
	return { id, isFlagged: false };
}
