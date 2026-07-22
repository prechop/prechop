import "server-only";
import { cookies } from "next/headers";
import {
	COOKIE_DOMAIN,
	IS_PROD,
	REFRESH_TOKEN_MAX_AGE_SECONDS,
} from "../constants";
import type { IJwtPayload } from "../types";

// In production we use `__Host-` prefixed cookies: the browser enforces Secure,
// no Domain (host-only), and Path=/. In dev (no HTTPS) the browser would refuse
// a `__Host-` cookie, so we fall back to the bare name.
export const ACCESS_COOKIE = IS_PROD ? "__Host-accessToken" : "accessToken";
export const REFRESH_COOKIE = IS_PROD ? "__Host-refreshToken" : "refreshToken";

const LEGACY_ACCESS_COOKIE = "accessToken";
const LEGACY_REFRESH_COOKIE = "refreshToken";

type CookieOptions = {
	httpOnly: boolean;
	secure: boolean;
	sameSite: "lax" | "strict";
	domain?: string;
	path: string;
	expires?: Date;
	maxAge?: number;
};

export function getAuthCookieOptions(extra?: {
	expires?: Date;
	maxAge?: number;
}): CookieOptions {
	const opts: CookieOptions = {
		httpOnly: true,
		secure: IS_PROD,
		// OAuth providers send users back to us through a cross-site top-level
		// redirect. `strict` can hide freshly-set auth cookies on that immediate
		// return path, which makes protected destinations like /admin bounce to
		// login even though the session exists moments later.
		sameSite: "lax",
		path: "/",
	};
	if (!IS_PROD && COOKIE_DOMAIN) opts.domain = COOKIE_DOMAIN;
	if (extra?.expires) opts.expires = extra.expires;
	if (extra?.maxAge !== undefined) opts.maxAge = extra.maxAge;
	return opts;
}

export async function setAuthCookies(token: IJwtPayload): Promise<void> {
	const store = await cookies();
	store.set(ACCESS_COOKIE, token.accessToken, {
		...getAuthCookieOptions({ expires: new Date(token.expiresIn) }),
	});
	store.set(REFRESH_COOKIE, token.refreshToken, {
		...getAuthCookieOptions({
			expires: new Date(
				token.refreshTokenExpiresIn ??
					Date.now() + REFRESH_TOKEN_MAX_AGE_SECONDS * 1000,
			),
			maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
		}),
	});
}

export async function clearAuthCookies(): Promise<void> {
	const store = await cookies();
	const opts = getAuthCookieOptions();
	store.set(ACCESS_COOKIE, "", { ...opts, maxAge: 0 });
	store.set(REFRESH_COOKIE, "", { ...opts, maxAge: 0 });
	if (IS_PROD) {
		store.set(LEGACY_ACCESS_COOKIE, "", { ...opts, maxAge: 0 });
		store.set(LEGACY_REFRESH_COOKIE, "", { ...opts, maxAge: 0 });
	}
}

export async function getCookieValue(name: string): Promise<string | null> {
	const store = await cookies();
	return store.get(name)?.value ?? null;
}

export { REFRESH_TOKEN_MAX_AGE_SECONDS };
