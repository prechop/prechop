import { ErrForbidden, ErrInvalidFields, ErrResourceNotFound } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { redeemReward } from "@/server/services/referrals/rewards";
import { getVendorProfileByUserIdDB } from "@/server/models";
import { applyRewardSchema } from "@/server/validators/referrals/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/referral/apply-reward" },
	withAuth(async ({ req, auth }) => {
		try {
			const vendor = await getVendorProfileByUserIdDB({ userId: auth.userId });
			if (!vendor) throw ErrForbidden;

			const parsed = applyRewardSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;

			const reward = await redeemReward({
				rewardId: parsed.data.rewardId,
				buyerOrderId: auth.userId,
			});

			if (!reward) throw ErrResourceNotFound;

			return ok({ reward });
		} catch (e) {
			return handleError(e);
		}
	}),
);
