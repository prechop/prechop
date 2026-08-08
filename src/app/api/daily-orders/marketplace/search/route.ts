import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, optionalUserId, withApiHandler } from "@/server/lib";
import { getBuyerFollowedVendorIds } from "@/server/services/vendorFollowers";
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
			const viewerUserId = await optionalUserId(req);
			let followedVendorIds: string[] = [];
			if (viewerUserId) {
				followedVendorIds = await getBuyerFollowedVendorIds({
					buyerId: viewerUserId,
				});
			}
			return ok(
				await searchMarketplace({ ...parsed.data, followedVendorIds }),
			);
		} catch (error) {
			return handleError(error);
		}
	},
);
