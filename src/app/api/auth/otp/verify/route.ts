import { ErrInvalidFields } from "@/server/constants";
import {
	getClientIp,
	handleError,
	ok,
	setAuthCookies,
	withApiHandler,
} from "@/server/lib";
import { verifyOtpService } from "@/server/services/auth";
import { verifyOtpBodySchema } from "@/server/validators/auth/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/auth/otp/verify",
		rateLimit: { windowMs: 60_000, maxRequests: 10 },
	},
	async ({ req }) => {
		try {
			const parsed = verifyOtpBodySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const { token, user } = await verifyOtpService({
				phone: parsed.data.phone,
				otp: parsed.data.otp,
				ip: getClientIp(req),
			});
			await setAuthCookies(token);
			return ok({ accessToken: token.accessToken, user });
		} catch (error) {
			return handleError(error);
		}
	},
);
