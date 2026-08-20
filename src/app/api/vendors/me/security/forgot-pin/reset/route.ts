import { ErrInvalidFields } from "@/server/constants";
import { getClientIp, handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { resetPinWithResetToken } from "@/server/services/vendors/forgotPin";
import { forgotPinResetSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/vendors/me/security/forgot-pin/reset",
		rateLimit: { windowMs: 60_000, maxRequests: 5 },
	},
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = forgotPinResetSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await resetPinWithResetToken({
				resetToken: parsed.data.resetToken,
				newPin: parsed.data.newPin,
				ip: getClientIp(req),
				userAgent: req.headers.get("user-agent") ?? undefined,
			});
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	}),
);
