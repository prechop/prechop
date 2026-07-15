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
	withAuth(async ({ req, auth, context }) => {
		try {
			assertVendor(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const body = (await req.json().catch(() => ({}))) as {
				reason?: string;
			};
			return ok(
				await closeDailyOrder({
					userId: auth.userId,
					orderId,
					reason: body.reason,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
