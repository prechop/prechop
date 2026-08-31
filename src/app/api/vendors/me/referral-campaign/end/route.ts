import { ErrInvalidFields } from "@/server/constants";
import {
	assertActiveVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { endCampaign } from "@/server/services/referrals/campaign";
import { endReferralCampaignSchema } from "@/server/validators/referrals/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendors/me/referral-campaign/end" },
	withAuth(async ({ req, auth }) => {
		try {
			const vendor = await assertActiveVendor(auth);
			const parsed = endReferralCampaignSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;

			const updated = await endCampaign({ vendorId: vendor._id.toString() });
			return ok(updated);
		} catch (e) {
			return handleError(e);
		}
	}),
);
