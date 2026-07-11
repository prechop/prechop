import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler } from "@/server/lib";
import { searchMarketplace } from "@/server/services/dailyOrders";
import { marketplaceSearchSchema } from "@/server/validators/dailyOrders/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/daily-orders/marketplace/search" },
	async ({ req }) => {
		try {
			const url = new URL(req.url);
			const parsed = marketplaceSearchSchema.safeParse(
				Object.fromEntries(url.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(await searchMarketplace(parsed.data));
		} catch (error) {
			return handleError(error);
		}
	},
);
