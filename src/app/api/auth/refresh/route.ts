import { NextResponse } from "next/server";
import {
	decodeJwtToken,
	ErrTokenCompromised,
	ErrUnauthorized,
} from "@/server/constants";
import {
	clearAuthCookies,
	clearAuthCookiesOnResponse,
	getClientIp,
	getCookieValue,
	getRequestCookieValue,
	handleError,
	ok,
	REFRESH_COOKIE,
	setAuthCookiesOnResponse,
	withApiHandler,
} from "@/server/lib";
import reLoginUserWithRefreshToken from "@/server/services/auth/reLoginUserWithRefreshToken";

export const runtime = "nodejs";

function cleanNext(value: string | null): string {
	if (!value?.startsWith("/") || value.startsWith("//"))
		return "/marketplace";
	return value;
}

async function refreshSession(req: Request) {
	const refreshToken =
		getRequestCookieValue(req, REFRESH_COOKIE) ??
		(await getCookieValue(REFRESH_COOKIE));
	if (!refreshToken) throw ErrUnauthorized;
	const decoded = await decodeJwtToken({ refreshToken }).catch(() => null);
	if (!decoded) throw ErrUnauthorized;
	const token = await reLoginUserWithRefreshToken({
		id: decoded.userId,
		refreshToken,
		ip: decoded.ip || getClientIp(req),
	});
	if (!token) throw ErrUnauthorized;
	return token;
}

export const POST = withApiHandler(
	{ route: "/api/auth/refresh" },
	async ({ req }) => {
		try {
			const token = await refreshSession(req);
			const response = ok({ accessToken: token.accessToken });
			setAuthCookiesOnResponse(response, token);
			return response;
		} catch (error) {
			if (error === ErrTokenCompromised || error === ErrUnauthorized) {
				await clearAuthCookies();
			}

			return handleError(error);
		}
	},
);

export const GET = withApiHandler(
	{ route: "/api/auth/refresh", rateLimit: false },
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
			login.searchParams.set("refresh", "failed");
			const response = NextResponse.redirect(login);
			clearAuthCookiesOnResponse(response);
			return response;
		}
	},
);
