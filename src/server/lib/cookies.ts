import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { COOKIE_DOMAIN, IS_PROD } from "../constants";
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
	const opts = getHostOnlyAuthCookieOptions(extra);
	if (!IS_PROD && COOKIE_DOMAIN) opts.domain = COOKIE_DOMAIN;
	return opts;
}

function getHostOnlyAuthCookieOptions(extra?: {
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
	if (extra?.expires) opts.expires = extra.expires;
	if (extra?.maxAge !== undefined) opts.maxAge = extra.maxAge;
	return opts;
}

function clearCookieOptionVariants(): CookieOptions[] {
	const opts = getAuthCookieOptions({ maxAge: 0 });
	if (!IS_PROD && COOKIE_DOMAIN) {
		return [opts, getHostOnlyAuthCookieOptions({ maxAge: 0 })];
	}
	return [opts];
}

export async function setAuthCookies(token: IJwtPayload): Promise<void> {
	const store = await cookies();
	const refreshExpires = new Date(token.refreshTokenExpiresIn);
	const refreshMaxAge = Math.max(
		0,
		Math.floor((refreshExpires.getTime() - Date.now()) / 1000),
	);
	store.set(ACCESS_COOKIE, token.accessToken, {
		...getAuthCookieOptions({ expires: new Date(token.expiresIn) }),
	});
	store.set(REFRESH_COOKIE, token.refreshToken, {
		...getAuthCookieOptions({
			expires: refreshExpires,
			maxAge: refreshMaxAge,
		}),
	});
}

export function setAuthCookiesOnResponse(
	response: NextResponse,
	token: IJwtPayload,
): void {
	const refreshExpires = new Date(token.refreshTokenExpiresIn);
	const refreshMaxAge = Math.max(
		0,
		Math.floor((refreshExpires.getTime() - Date.now()) / 1000),
	);
	response.cookies.set(ACCESS_COOKIE, token.accessToken, {
		...getAuthCookieOptions({ expires: new Date(token.expiresIn) }),
	});
	response.cookies.set(REFRESH_COOKIE, token.refreshToken, {
		...getAuthCookieOptions({
			expires: refreshExpires,
			maxAge: refreshMaxAge,
		}),
	});
}

export async function clearAuthCookies(): Promise<void> {
	const store = await cookies();
	for (const opts of clearCookieOptionVariants()) {
		store.set(ACCESS_COOKIE, "", opts);
		store.set(REFRESH_COOKIE, "", opts);
		if (IS_PROD) {
			store.set(LEGACY_ACCESS_COOKIE, "", opts);
			store.set(LEGACY_REFRESH_COOKIE, "", opts);
		}
	}
}

export function clearAuthCookiesOnResponse(response: NextResponse): void {
	for (const opts of clearCookieOptionVariants()) {
		response.cookies.set(ACCESS_COOKIE, "", opts);
		response.cookies.set(REFRESH_COOKIE, "", opts);
		if (IS_PROD) {
			response.cookies.set(LEGACY_ACCESS_COOKIE, "", opts);
			response.cookies.set(LEGACY_REFRESH_COOKIE, "", opts);
		}
	}
}

export async function getCookieValue(name: string): Promise<string | null> {
	const store = await cookies();
	return store.get(name)?.value ?? null;
}

export function getRequestCookieValue(
	req: Request,
	cookieName: string,
): string | null {
	const header = req.headers.get("cookie");
	if (!header) return null;
	for (const rawCookie of header.split(";")) {
		const [name, ...valueParts] = rawCookie.trim().split("=");
		if (name !== cookieName) continue;
		const rawValue = valueParts.join("=");
		if (!rawValue) return null;
		try {
			return decodeURIComponent(rawValue);
		} catch {
			return rawValue;
		}
	}
	return null;
}
