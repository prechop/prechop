import { ErrForbidden, notFound, validationError } from "../../constants";
import {
	flagReviewDB,
	getReviewByIdDB,
	getVendorProfileByUserIdDB,
} from "../../models";

export async function reportReview({
	userId,
	reviewId,
}: {
	userId: string;
	reviewId: string;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrForbidden;

	const review = await getReviewByIdDB({ id: reviewId });
	if (!review) throw notFound("Review");
	if (review.vendorId.toString() !== vendor._id.toString())
		throw ErrForbidden;

	const ok = await flagReviewDB({ id: reviewId });
	if (!ok) throw validationError("Could not report this review.");

	return { id: reviewId, isFlagged: true };
}
