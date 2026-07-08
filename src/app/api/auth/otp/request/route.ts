import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler } from "@/server/lib";
import { requestOtp } from "@/server/services/auth";
import { requestOtpBodySchema } from "@/server/validators/auth/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/auth/otp/request",
		rateLimit: { windowMs: 60_000, maxRequests: 10 },
	},
	async ({ req }) => {
		try {
			const parsed = requestOtpBodySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await requestOtp(parsed.data.phone);
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	},
);
