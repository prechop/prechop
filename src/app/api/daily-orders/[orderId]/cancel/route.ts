import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { cancelDailyOrder } from "@/server/services/dailyOrders";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/daily-orders/[orderId]/cancel" },
	withAuth(async ({ auth, context }) => {
		try {
			assertVendor(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			return ok(await cancelDailyOrder({ userId: auth.userId, orderId }));
		} catch (error) {
			return handleError(error);
		}
	}),
);
