import {
	assertBuyer,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getReviewForOrder } from "@/server/services/reviews";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/orders/[orderId]/review" },
	withAuth(async ({ auth, context }) => {
		try {
			assertBuyer(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			return ok(
				await getReviewForOrder({
					userId: auth.userId,
					buyerOrderId: orderId,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
