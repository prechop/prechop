import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler } from "@/server/lib";
import { getMarketplace } from "@/server/services/dailyOrders";
import { marketplaceQuerySchema } from "@/server/validators/dailyOrders/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/daily-orders/marketplace" },
	async ({ req }) => {
		try {
			const url = new URL(req.url);
			const parsed = marketplaceQuerySchema.safeParse(
				Object.fromEntries(url.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(await getMarketplace(parsed.data));
		} catch (error) {
			return handleError(error);
		}
	},
);
