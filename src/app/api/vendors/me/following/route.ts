import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { getBuyerFollowedVendorIds } from "@/server/services/vendorFollowers";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/me/following" },
	withAuth(async ({ auth }) => {
		try {
			const vendorIds = await getBuyerFollowedVendorIds({
				buyerId: auth.userId,
			});
			return ok({ vendorIds });
		} catch (e) {
			return handleError(e);
		}
	}),
);
