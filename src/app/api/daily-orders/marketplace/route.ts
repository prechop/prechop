import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, optionalUserId, withApiHandler } from "@/server/lib";
import { getBuyerFollowedVendorIds } from "@/server/services/vendorFollowers";
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
			// Public endpoint, but personalise for a signed-in caller: a vendor
			// never sees their own listings in the marketplace grid.
			const viewerUserId = await optionalUserId(req);
			let followedVendorIds: string[] = [];
			if (viewerUserId) {
				followedVendorIds = await getBuyerFollowedVendorIds({
					buyerId: viewerUserId,
				});
			}
			return ok(
				await getMarketplace({ ...parsed.data, viewerUserId, followedVendorIds }),
			);
		} catch (error) {
			return handleError(error);
		}
	},
);
