import {
	getClientIp,
	getUserAgent,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	getMyVendorProfile,
	submitVendorForReview,
	vendorIdOf,
} from "@/server/services/vendors";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/vendors/me/submit",
		rateLimit: { windowMs: 60_000, maxRequests: 10 },
	},
	withAuth(async ({ req, auth }) => {
		try {
			const vendor = await getMyVendorProfile({ userId: auth.userId });
			const result = await submitVendorForReview({
				vendorId: vendorIdOf(vendor),
				userId: auth.userId,
				ip: getClientIp(req),
				userAgent: getUserAgent(req),
			});
			return ok(result, "Submitted for review");
		} catch (e) {
			return handleError(e);
		}
	}),
);
