import { NextResponse } from "next/server";
import { ErrInvalidFields } from "@/server/constants";
import {
	getClientIp,
	handleError,
	setAuthCookies,
	withApiHandler,
} from "@/server/lib";
import { verifyEmailSignIn } from "@/server/services/auth";
import { emailSignInVerifyQuerySchema } from "@/server/validators/auth/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/auth/email/verify" },
	async ({ req }) => {
		try {
			const url = new URL(req.url);
			const parsed = emailSignInVerifyQuerySchema.safeParse({
				token: url.searchParams.get("token") ?? undefined,
				next: url.searchParams.get("next") ?? undefined,
			});
			if (!parsed.success) throw ErrInvalidFields;
			const { token, next } = await verifyEmailSignIn({
				...parsed.data,
				ip: getClientIp(req),
			});
			await setAuthCookies(token);
			return NextResponse.redirect(new URL(next, req.url));
		} catch (error) {
			const response = handleError(error);
			if (response.status >= 400) return response;
			return response;
		}
	},
);
