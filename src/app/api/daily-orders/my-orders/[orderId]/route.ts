import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getMyDailyOrderById } from "@/server/services/dailyOrders";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/daily-orders/my-orders/[orderId]" },
	withAuth(async ({ auth, context }) => {
		try {
			assertVendor(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			return ok(
				await getMyDailyOrderById({ userId: auth.userId, orderId }),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
