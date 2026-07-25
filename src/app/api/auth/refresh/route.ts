import { NextResponse } from "next/server";
import {
	decodeJwtToken,
	ErrTokenCompromised,
	ErrUnauthorized,
} from "@/server/constants";
import {
	ACCESS_COOKIE,
	clearAuthCookies,
	getAuthCookieOptions,
	getClientIp,
	getCookieValue,
	handleError,
	ok,
	REFRESH_COOKIE,
	setAuthCookies,
	withApiHandler,
} from "@/server/lib";
import reLoginUserWithRefreshToken from "@/server/services/auth/reLoginUserWithRefreshToken";
import type { IJwtPayload } from "@/server/types";

export const runtime = "nodejs";

const LEGACY_ACCESS_COOKIE = "accessToken";
const LEGACY_REFRESH_COOKIE = "refreshToken";

function cleanNext(value: string | null): string {
	if (!value?.startsWith("/") || value.startsWith("//"))
		return "/marketplace";
	return value;
}

async function refreshSession(req: Request) {
	const refreshToken = await getCookieValue(REFRESH_COOKIE);
	if (!refreshToken) throw ErrUnauthorized;
	const decoded = await decodeJwtToken({ refreshToken }).catch(() => null);
	if (!decoded) throw ErrUnauthorized;
	const token = await reLoginUserWithRefreshToken({
		id: decoded.userId,
		refreshToken,
		ip: decoded.ip || getClientIp(req),
	});
	if (!token) throw ErrUnauthorized;
	await setAuthCookies(token);
	return token;
}

function setAuthCookiesOnResponse(
	response: NextResponse,
	token: IJwtPayload,
): void {
	response.cookies.set(ACCESS_COOKIE, token.accessToken, {
		...getAuthCookieOptions({ expires: new Date(token.expiresIn) }),
	});
	response.cookies.set(REFRESH_COOKIE, token.refreshToken, {
		...getAuthCookieOptions({
			expires: new Date(token.refreshTokenExpiresIn),
		}),
	});
}

function clearAuthCookiesOnResponse(response: NextResponse): void {
	const opts = getAuthCookieOptions();
	response.cookies.set(ACCESS_COOKIE, "", { ...opts, maxAge: 0 });
	response.cookies.set(REFRESH_COOKIE, "", { ...opts, maxAge: 0 });
	if (process.env.NODE_ENV === "production") {
		response.cookies.set(LEGACY_ACCESS_COOKIE, "", {
			...opts,
			maxAge: 0,
		});
		response.cookies.set(LEGACY_REFRESH_COOKIE, "", {
			...opts,
			maxAge: 0,
		});
	}
}

export const POST = withApiHandler(
	{ route: "/api/auth/refresh" },
	async ({ req }) => {
		try {
			const token = await refreshSession(req);
			return ok({ accessToken: token.accessToken });
		} catch (error) {
			if (error === ErrTokenCompromised || error === ErrUnauthorized) {
				await clearAuthCookies();
			}

			return handleError(error);
		}
	},
);

export const GET = withApiHandler(
	{ route: "/api/auth/refresh" },
	async ({ req }) => {
		const url = new URL(req.url);
		const next = cleanNext(url.searchParams.get("next"));
		try {
			const token = await refreshSession(req);
			const response = NextResponse.redirect(new URL(next, req.url));
			setAuthCookiesOnResponse(response, token);
			return response;
		} catch (error) {
			if (error === ErrTokenCompromised || error === ErrUnauthorized) {
				await clearAuthCookies();
			}
			const login = new URL("/login", req.url);
			login.searchParams.set("next", next);
			const response = NextResponse.redirect(login);
			clearAuthCookiesOnResponse(response);
			return response;
		}
	},
);
