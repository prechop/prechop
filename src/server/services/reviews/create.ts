import {
	ErrForbidden,
	ErrOrderNotFound,
	ErrReviewAlreadyExists,
	ErrReviewWindowExpired,
	validationError,
} from "../../constants";
import {
	createReviewDB,
	getBuyerOrderByIdDB,
	getReviewByOrderDB,
	getVendorRatingAggregateDB,
	OrderStatus,
	updateVendorRatingDB,
} from "../../models";
import type { CreateReviewInput } from "../../validators/reviews/validate";
import { getSiteConfigs } from "../siteConfigs";

export async function createReview({
	userId,
	input,
}: {
	userId: string;
	input: CreateReviewInput;
}) {
	const order = await getBuyerOrderByIdDB({ id: input.buyerOrderId });
	if (!order) throw ErrOrderNotFound;
	if (order.buyerId.toString() !== userId) throw ErrForbidden;
	if (order.status !== OrderStatus.COMPLETED) {
		throw validationError("Only completed orders can be reviewed.");
	}

	const { reviewWindowHours } = await getSiteConfigs();
	const windowMs = reviewWindowHours * 60 * 60 * 1000;
	if (Date.now() - order.updatedAt.getTime() > windowMs) {
		throw ErrReviewWindowExpired;
	}

	const existing = await getReviewByOrderDB({
		buyerOrderId: input.buyerOrderId,
	});
	if (existing) throw ErrReviewAlreadyExists;

	const vendorId = order.vendorId.toString();
	const review = await createReviewDB({
		payload: {
			buyerOrderId: input.buyerOrderId,
			vendorId,
			buyerId: userId,
			rating: input.rating,
			comment: input.comment,
			tags: input.tags,
		},
	});
	if (!review) throw ErrReviewAlreadyExists;

	const { avg, count } = await getVendorRatingAggregateDB({ vendorId });
	await updateVendorRatingDB({
		id: vendorId,
		rating: avg,
		totalReviews: count,
	});

	return review;
}
