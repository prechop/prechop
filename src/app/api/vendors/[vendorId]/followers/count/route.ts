import { ErrForbidden } from "@/server/constants";
import {
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getVendorFollowerCount } from "@/server/services/vendorFollowers";
import {
	listVendorFollowersDB,
	getVendorProfileByUserIdDB,
} from "@/server/models";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/[vendorId]/followers/count" },
	withAuth(async ({ auth, context }) => {
		try {
			const { vendorId } = await (
				context as { params: Promise<{ vendorId: string }> }
			).params;

			const callerVendor = await getVendorProfileByUserIdDB({
				userId: auth.userId,
			});

			if (!callerVendor || callerVendor._id.toString() !== vendorId) {
				throw ErrForbidden;
			}

			const [{ count, newThisWeek }, followers] = await Promise.all([
				getVendorFollowerCount({ vendorId }),
				listVendorFollowersDB({ vendorId, limit: 50 }),
			]);

			return ok({
				count,
				newThisWeek,
				recentFollowers: followers.map((f) => ({
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
