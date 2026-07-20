import { NextResponse } from "next/server";
import { GOOGLE_OAUTH_CLIENT_ID, validationError } from "@/server/constants";
import { APP_URL } from "@/server/constants/environments";
import { handleError, withApiHandler } from "@/server/lib";
import { createGoogleAuthState } from "@/server/services/auth";
import { googleStartQuerySchema } from "@/server/validators/auth/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/auth/google/start" },
	async ({ req }) => {
		try {
			if (!GOOGLE_OAUTH_CLIENT_ID) {
				throw validationError("Google sign-in is not configured yet.");
			}
			const url = new URL(req.url);
			const parsed = googleStartQuerySchema.safeParse({
				next: url.searchParams.get("next") ?? undefined,
			});
			if (!parsed.success) {
				throw validationError("Invalid return path.");
			}
			const state = await createGoogleAuthState(parsed.data.next);
			const redirectUri = `${APP_URL.replace(/\/$/, "")}/api/auth/google/callback`;
			const googleUrl = new URL(
				"https://accounts.google.com/o/oauth2/v2/auth",
			);
			googleUrl.searchParams.set("client_id", GOOGLE_OAUTH_CLIENT_ID);
			googleUrl.searchParams.set("redirect_uri", redirectUri);
			googleUrl.searchParams.set("response_type", "code");
			googleUrl.searchParams.set("scope", "openid email profile");
			googleUrl.searchParams.set("prompt", "select_account");
			googleUrl.searchParams.set("state", state);
			return NextResponse.redirect(googleUrl);
		} catch (error) {
			return handleError(error);
		}
	},
);
