import { ErrInvalidFields } from "@/server/constants";
import {
	getClientIp,
	handleError,
	ok,
	setAuthCookies,
	setAuthCookiesOnResponse,
	withApiHandler,
} from "@/server/lib";
import {
	resolvePostAuthRedirect,
	verifyWhatsAppSignIn,
} from "@/server/services/auth";
import { whatsappSignInVerifyBodySchema } from "@/server/validators/auth/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/auth/whatsapp/verify",
		rateLimit: { windowMs: 10 * 60_000, maxRequests: 15 },
	},
	async ({ req }) => {
		try {
			const parsed = whatsappSignInVerifyBodySchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const { token, user, next } = await verifyWhatsAppSignIn({
				...parsed.data,
				ip: getClientIp(req),
			});
			await setAuthCookies(token);
			const response = ok({
				user,
				next: await resolvePostAuthRedirect(user, next),
			});
			setAuthCookiesOnResponse(response, token);
			return response;
		} catch (error) {
			return handleError(error);
		}
	},
);
