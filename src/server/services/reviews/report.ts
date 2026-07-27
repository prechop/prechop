import { ErrForbidden, notFound, validationError } from "../../constants";
import {
	flagReviewDB,
	getReviewByIdDB,
	getVendorProfileByUserIdDB,
} from "../../models";
import { notifyAdminAttention } from "../notifications";

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
	await notifyAdminAttention({
		kind: "REPORTED_REVIEW",
		title: "Review reported",
		whatHappened: `A vendor reported a ${review.rating}-star review for moderation.`,
		submittedBy: `${vendor.businessName ?? "Vendor"} (user ${userId})`,
		recordId: reviewId,
		adminPath: `/admin/reviews?reviewId=${encodeURIComponent(reviewId)}`,
		dedupeKey: `reported-review:${reviewId}`,
	});

	return { id: reviewId, isFlagged: true };
}
