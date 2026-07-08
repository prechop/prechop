import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { closeDailyOrder } from "@/server/services/dailyOrders";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/daily-orders/[orderId]/close" },
	withAuth(async ({ auth, context }) => {
		try {
			assertVendor(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			return ok(await closeDailyOrder({ userId: auth.userId, orderId }));
		} catch (error) {
			return handleError(error);
		}
	}),
);
