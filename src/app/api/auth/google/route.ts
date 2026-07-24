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
	createGoogleAuthState,
	resolvePostAuthRedirect,
	signInWithGoogleProfile,
} from "@/server/services/auth";
import {
	googleCallbackQuerySchema,
	googleStartQuerySchema,
} from "@/server/validators/auth/validate";

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
	{ route: "/api/auth/google" },
	async ({ req }) => {
		try {
			const url = new URL(req.url);
			const hasCallbackParams =
				url.searchParams.has("code") ||
				url.searchParams.has("state") ||
				url.searchParams.has("error");
			if (hasCallbackParams) return handleGoogleCallback(req, url);
			return startGoogleSignIn(url);
		} catch (error) {
			return handleError(error);
		}
	},
);

async function startGoogleSignIn(url: URL) {
	if (!GOOGLE_OAUTH_CLIENT_ID) {
		throw validationError("Google sign-in is not configured yet.");
	}
	const parsed = googleStartQuerySchema.safeParse({
		next: url.searchParams.get("next") ?? undefined,
	});
	if (!parsed.success) throw validationError("Invalid return path.");
	const state = await createGoogleAuthState(parsed.data.next);
	const redirectUri = `${APP_URL.replace(/\/$/, "")}/api/auth/google/callback`;
	const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	googleUrl.searchParams.set("client_id", GOOGLE_OAUTH_CLIENT_ID);
	googleUrl.searchParams.set("redirect_uri", redirectUri);
	googleUrl.searchParams.set("response_type", "code");
	googleUrl.searchParams.set("scope", "openid email profile");
	googleUrl.searchParams.set("prompt", "select_account");
	googleUrl.searchParams.set("state", state);
	return NextResponse.redirect(googleUrl);
}

async function handleGoogleCallback(req: Request, url: URL) {
	const parsed = googleCallbackQuerySchema.safeParse({
		code: url.searchParams.get("code") ?? undefined,
		state: url.searchParams.get("state") ?? undefined,
		error: url.searchParams.get("error") ?? undefined,
	});
	if (!parsed.success) throw validationError("Invalid Google response.");
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
	const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
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
	});
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
		throw validationError("Google did not return an email address.");
	}
	if (!profile.email_verified) {
		throw validationError("Google email must be verified.");
	}
	const [fallbackFirstName, ...fallbackLastName] = (profile.name ?? "")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	const { token, user } = await signInWithGoogleProfile({
		email: profile.email,
		firstName: profile.given_name ?? fallbackFirstName,
		lastName: profile.family_name ?? fallbackLastName.join(" "),
		profileImageUrl: profile.picture,
		googleSubject: profile.sub,
		emailVerified: profile.email_verified,
		ip: getClientIp(req),
	});
	await setAuthCookies(token);
	return NextResponse.redirect(
		new URL(resolvePostAuthRedirect(user, state.next), req.url),
	);
}
