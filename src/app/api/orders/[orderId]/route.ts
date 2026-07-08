import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { getOrderById } from "@/server/services/buyerOrders";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/orders/[orderId]" },
	withAuth(async ({ auth, context }) => {
		try {
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const order = await getOrderById({ userId: auth.userId, orderId });
			return ok(order);
		} catch (error) {
			return handleError(error);
		}
	}),
);
