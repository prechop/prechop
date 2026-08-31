import { ErrInvalidFields, ErrVendorNotActive } from "@/server/constants";
import {
	assertActiveVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	endCampaign,
	getActiveCampaign,
	getOrCreateCampaign,
	updateCampaignSettings,
} from "@/server/services/referrals/campaign";
import { createReferralCampaignSchema, endReferralCampaignSchema } from "@/server/validators/referrals/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/me/referral-campaign" },
	withAuth(async ({ auth }) => {
		try {
			const vendor = await assertActiveVendor(auth);
			const campaign = await getActiveCampaign({ vendorId: vendor._id.toString() });
			return ok(campaign);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const POST = withApiHandler(
	{ route: "/api/vendors/me/referral-campaign" },
	withAuth(async ({ req, auth }) => {
		try {
			const vendor = await assertActiveVendor(auth);
			const parsed = createReferralCampaignSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;

			const campaign = await getOrCreateCampaign({ vendorId: vendor._id.toString() });

			const updates: Record<string, unknown> = { ...parsed.data };
			if (updates.endDate) {
				updates.endDate = new Date(updates.endDate as string);
			}

			const updated = await updateCampaignSettings({
				vendorId: vendor._id.toString(),
				...updates,
			});

			return ok(updated);
		} catch (e) {
			return handleError(e);
		}
	}),
);
