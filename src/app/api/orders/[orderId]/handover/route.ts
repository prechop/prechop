import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { getBuyerHandoverCredential } from "@/server/services/buyerOrders";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/orders/[orderId]/handover" },
	withAuth(async ({ auth, context }) => {
		try {
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const credential = await getBuyerHandoverCredential({
				buyerId: auth.userId,
				orderId,
			});
			return ok(credential);
		} catch (error) {
			return handleError(error);
		}
	}),
);
