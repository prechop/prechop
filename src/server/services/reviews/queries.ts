import { ErrForbidden, ErrOrderNotFound } from "../../constants";
import { getBuyerOrderByIdDB, getReviewByOrderDB } from "../../models";

export async function getReviewForOrder({
	userId,
	buyerOrderId,
}: {
	userId: string;
	buyerOrderId: string;
}) {
	const order = await getBuyerOrderByIdDB({ id: buyerOrderId });
	if (!order) throw ErrOrderNotFound;
	if (order.buyerId.toString() !== userId) throw ErrForbidden;
	return getReviewByOrderDB({ buyerOrderId });
}
