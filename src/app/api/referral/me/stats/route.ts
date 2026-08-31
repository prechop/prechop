import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { getCreatorDashboard } from "@/server/services/referrals/rewards";
import { getOrCreateLink } from "@/server/services/referrals/links";
import { getVendorProfileByUserIdDB } from "@/server/models";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/referral/me/stats" },
	withAuth(async ({ auth, req }) => {
		try {
			const url = new URL(req.url);
			const targetVendorId = url.searchParams.get("vendorId")?.trim();
			let vendorId = targetVendorId;
			let campaign: { endDate: Date } | null = null;

			if (!vendorId) {
				const vendor = await getVendorProfileByUserIdDB({ userId: auth.userId });
				if (!vendor) {
					return ok({
						hasLink: false,
						link: null,
						dashboard: null,
					});
				}
				vendorId = vendor._id.toString();
			}

			const link = await getOrCreateLink({
				vendorId,
				creatorUserId: auth.userId,
			});

			const dashboard = await getCreatorDashboard({
				vendorId,
				creatorUserId: auth.userId,
			});

			return ok({
				hasLink: true,
				link: {
					token: link.token,
					url: `${process.env.APP_URL ?? "http://localhost:3000"}/r/${link.token}`,
				},
				dashboard: {
					...dashboard,
					campaignEndDate: dashboard.campaignEndDate,
				},
			});
		} catch (e) {
			return handleError(e);
		}
	}),
);
