import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { getAvailableRewards } from "@/server/services/referrals/rewards";
import { getVendorProfileByUserIdDB } from "@/server/models";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/referral/me/rewards" },
	withAuth(async ({ auth }) => {
		try {
			const vendor = await getVendorProfileByUserIdDB({ userId: auth.userId });
			if (!vendor) {
				return ok([]);
			}

			const vendorId = vendor._id.toString();
			const rewards = await getAvailableRewards({
				vendorId,
				creatorUserId: auth.userId,
			});

			return ok(rewards);
		} catch (e) {
			return handleError(e);
		}
	}),
);
