import { ErrInvalidFields } from "@/server/constants";
import { getClientIp, handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { verifyPinResetOtp } from "@/server/services/vendors/forgotPin";
import { forgotPinVerifySchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/vendors/me/security/forgot-pin/verify",
		rateLimit: { windowMs: 60_000, maxRequests: 10 },
	},
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = forgotPinVerifySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await verifyPinResetOtp({
				userId: auth.userId,
				email: parsed.data.email,
				otp: parsed.data.otp,
				ip: getClientIp(req),
				userAgent: req.headers.get("user-agent") ?? undefined,
			});
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	}),
);
