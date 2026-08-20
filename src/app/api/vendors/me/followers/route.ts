import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { listVendorFollowersDB } from "@/server/models/vendorFollowers";
import { getVendorProfileByUserIdDB } from "@/server/models/vendorProfiles";
import { getVendorFollowerCount } from "@/server/services/vendorFollowers";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/me/followers" },
	withAuth(async ({ auth }) => {
		try {
			const vendor = await getVendorProfileByUserIdDB({
				userId: auth.userId,
			});

			if (!vendor) {
				return ok({ followers: [], count: 0, newThisWeek: 0 });
			}

			const vendorId = vendor._id.toString();
			const [{ count, newThisWeek }, followers] = await Promise.all([
				getVendorFollowerCount({ vendorId }),
				listVendorFollowersDB({ vendorId, limit: 100 }),
			]);

			return ok({
				count,
				newThisWeek,
				followers: followers.map((f) => ({
					id: f._id.toString(),
					buyerId: f.buyerId.toString(),
					createdAt: f.createdAt,
				})),
			});
		} catch (e) {
			return handleError(e);
		}
	}),
);
