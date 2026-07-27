import {
	assertBuyer,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { revealKitchenContactForBuyer } from "@/server/services/buyerOrders";

export const runtime = "nodejs";

const handler = withApiHandler(
	{ route: "/api/orders/[orderId]/contact/kitchen" },
	withAuth(async ({ auth, context }) => {
		try {
			assertBuyer(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const result = await revealKitchenContactForBuyer({
				buyerId: auth.userId,
				orderId,
			});
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const GET = handler;
export const POST = handler;
