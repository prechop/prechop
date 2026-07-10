import { handleError, ok, optionalUserId, withApiHandler } from "@/server/lib";
import { getPublicDailyOrder } from "@/server/services/dailyOrders";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/daily-orders/public/[shareableToken]" },
	async ({ req, context }) => {
		try {
			const { shareableToken } = await (
				context as { params: Promise<{ shareableToken: string }> }
			).params;
			// Public endpoint; flag the caller's own listing so the client can
			// block ordering (the server-side guard in placeOrder is the backstop).
			const viewerUserId = await optionalUserId(req);
			return ok(
				await getPublicDailyOrder({ shareableToken, viewerUserId }),
			);
		} catch (error) {
			return handleError(error);
		}
	},
);
