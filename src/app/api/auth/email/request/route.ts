import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler } from "@/server/lib";
import { requestEmailSignIn } from "@/server/services/auth";
import { emailSignInRequestBodySchema } from "@/server/validators/auth/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/auth/email/request",
		rateLimit: { windowMs: 60_000, maxRequests: 10 },
	},
	async ({ req }) => {
		try {
			const parsed = emailSignInRequestBodySchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(await requestEmailSignIn(parsed.data));
		} catch (error) {
			return handleError(error);
		}
	},
);
