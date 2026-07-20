import { NextResponse } from "next/server";
import {
	GOOGLE_OAUTH_CLIENT_ID,
	GOOGLE_OAUTH_CLIENT_SECRET,
	validationError,
} from "@/server/constants";
import { APP_URL } from "@/server/constants/environments";
import {
	getClientIp,
	handleError,
	setAuthCookies,
	withApiHandler,
} from "@/server/lib";
import {
	consumeGoogleAuthState,
	signInWithGoogleProfile,
} from "@/server/services/auth";
import { googleCallbackQuerySchema } from "@/server/validators/auth/validate";

export const runtime = "nodejs";

interface GoogleTokenResponse {
	access_token?: string;
	error?: string;
}

interface GoogleProfile {
	sub?: string;
	email?: string;
	email_verified?: boolean;
	name?: string;
	given_name?: string;
	family_name?: string;
	picture?: string;
}

export const GET = withApiHandler(
	{ route: "/api/auth/google/callback" },
	async ({ req }) => {
		try {
			const url = new URL(req.url);
			const parsed = googleCallbackQuerySchema.safeParse({
				code: url.searchParams.get("code") ?? undefined,
				state: url.searchParams.get("state") ?? undefined,
				error: url.searchParams.get("error") ?? undefined,
			});
			if (!parsed.success)
				throw validationError("Invalid Google response.");
			if (parsed.data.error) {
				throw validationError("Google sign-in was cancelled.");
			}
			if (
				!GOOGLE_OAUTH_CLIENT_ID ||
				!GOOGLE_OAUTH_CLIENT_SECRET ||
				!parsed.data.code ||
				!parsed.data.state
			) {
				throw validationError("Google sign-in is not configured yet.");
			}

			const state = await consumeGoogleAuthState(parsed.data.state);
			const redirectUri = `${APP_URL.replace(/\/$/, "")}/api/auth/google/callback`;
			const tokenRes = await fetch(
				"https://oauth2.googleapis.com/token",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						client_id: GOOGLE_OAUTH_CLIENT_ID,
						client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
						code: parsed.data.code,
						grant_type: "authorization_code",
						redirect_uri: redirectUri,
					}),
				},
			);
			const tokenJson = (await tokenRes.json()) as GoogleTokenResponse;
			if (!tokenRes.ok || !tokenJson.access_token) {
				throw validationError("Google sign-in failed.");
			}
			const profileRes = await fetch(
				"https://www.googleapis.com/oauth2/v3/userinfo",
				{
					headers: {
						Authorization: `Bearer ${tokenJson.access_token}`,
					},
				},
			);
			const profile = (await profileRes.json()) as GoogleProfile;
			if (!profileRes.ok || !profile.email) {
				throw validationError(
					"Google did not return an email address.",
				);
			}
			if (!profile.email_verified) {
				throw validationError("Google email must be verified.");
			}
			const [fallbackFirstName, ...fallbackLastName] = (
				profile.name ?? ""
			)
				.trim()
				.split(/\s+/)
				.filter(Boolean);
			const { token } = await signInWithGoogleProfile({
				email: profile.email,
				firstName: profile.given_name ?? fallbackFirstName,
				lastName: profile.family_name ?? fallbackLastName.join(" "),
				profileImageUrl: profile.picture,
				googleSubject: profile.sub,
				emailVerified: profile.email_verified,
				ip: getClientIp(req),
			});
			await setAuthCookies(token);
			return NextResponse.redirect(new URL(state.next, req.url));
		} catch (error) {
			return handleError(error);
		}
	},
);
