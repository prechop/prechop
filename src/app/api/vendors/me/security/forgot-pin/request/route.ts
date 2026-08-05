import { ErrInvalidFields } from "@/server/constants";
import { getClientIp, handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { requestPinReset } from "@/server/services/vendors/forgotPin";
import { forgotPinRequestSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/vendors/me/security/forgot-pin/request",
		rateLimit: { windowMs: 60_000, maxRequests: 3 },
	},
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = forgotPinRequestSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await requestPinReset({
				userId: auth.userId,
				email: parsed.data.email,
				ip: getClientIp(req),
				userAgent: req.headers.get("user-agent") ?? undefined,
			});
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	}),
);
