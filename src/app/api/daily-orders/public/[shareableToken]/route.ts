import { handleError, ok, withApiHandler } from "@/server/lib";
import { getPublicDailyOrder } from "@/server/services/dailyOrders";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/daily-orders/public/[shareableToken]" },
	async ({ context }) => {
		try {
			const { shareableToken } = await (
				context as { params: Promise<{ shareableToken: string }> }
			).params;
			return ok(await getPublicDailyOrder({ shareableToken }));
		} catch (error) {
			return handleError(error);
		}
	},
);
