import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler } from "@/server/lib";
import { requestWhatsAppSignIn } from "@/server/services/auth";
import { whatsappSignInRequestBodySchema } from "@/server/validators/auth/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/auth/whatsapp/request",
		rateLimit: { windowMs: 10 * 60_000, maxRequests: 5 },
	},
	async ({ req }) => {
		try {
			const parsed = whatsappSignInRequestBodySchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(await requestWhatsAppSignIn(parsed.data));
		} catch (error) {
			return handleError(error);
		}
	},
);
