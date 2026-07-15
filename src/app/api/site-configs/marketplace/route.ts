import { handleError, ok, withApiHandler } from "@/server/lib";
import { getSiteConfigs } from "@/server/services/siteConfigs";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/site-configs/marketplace" },
	async () => {
		try {
			const configs = await getSiteConfigs();
			return ok({
				marketplaceEnabled: configs.marketplaceEnabled,
			});
		} catch (error) {
			return handleError(error);
		}
	},
);
