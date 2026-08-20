import { ErrInvalidFields } from "@/server/constants";
import { getClientIp, handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { requestAdminPinReset } from "@/server/services/vendors/forgotPin";
import { forgotPinSupportSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/vendors/me/security/forgot-pin/support",
		rateLimit: { windowMs: 60_000, maxRequests: 3 },
	},
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = forgotPinSupportSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await requestAdminPinReset({
				userId: auth.userId,
				reason: parsed.data.reason,
				ip: getClientIp(req),
				userAgent: req.headers.get("user-agent") ?? undefined,
				auth: {
					userId: auth.userId,
					groups: auth.groups,
				},
			});
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	}),
);
