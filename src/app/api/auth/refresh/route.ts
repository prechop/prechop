import { NextResponse } from "next/server";
import {
	decodeJwtToken,
	ErrTokenCompromised,
	ErrUnauthorized,
} from "@/server/constants";
import {
	clearAuthCookies,
	getClientIp,
	getCookieValue,
	handleError,
	ok,
	REFRESH_COOKIE,
	setAuthCookies,
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
			await refreshSession(req);
			return NextResponse.redirect(new URL(next, req.url));
		} catch (error) {
			if (error === ErrTokenCompromised || error === ErrUnauthorized) {
				await clearAuthCookies();
			}
			const login = new URL("/login", req.url);
			login.searchParams.set("next", next);
			return NextResponse.redirect(login);
		}
	},
);
