import { jwtVerify } from "jose";
import { type NextRequest, NextResponse } from "next/server";

// Page-shell gate (Next 16 `proxy`, formerly `middleware`). Runs on every
// non-API request. The API layer remains the real authorization boundary.
const PROTECTED_ROUTES = [
	"/checkout",
	"/my-orders",
	"/account",
	"/dashboard",
	"/pipeline",
	"/menu",
	"/timetable",
	"/earnings",
	"/boost",
	"/admin",
];

const AUTH_ROUTES = ["/login"];

// Cookie names mirror src/server/lib/cookies.ts because the proxy runs at the
// edge and cannot import server-only modules.
const IS_PROD = process.env.NODE_ENV === "production";
const ACCESS_COOKIE = IS_PROD ? "__Host-accessToken" : "accessToken";
const REFRESH_COOKIE = IS_PROD ? "__Host-refreshToken" : "refreshToken";

function isProtectedRoute(pathname: string): boolean {
	return PROTECTED_ROUTES.some(
		(route) => pathname === route || pathname.startsWith(`${route}/`),
	);
}

let cachedKey: Uint8Array | null = null;
function getAccessSecret(): Uint8Array | null {
	if (cachedKey) return cachedKey;
	const secret = process.env.JWT_ACCESS_TOKEN_SECRET;
	if (!secret || secret.length < 32) return null;
	cachedKey = new TextEncoder().encode(secret);
	return cachedKey;
}

async function hasValidAccessToken(token: string): Promise<boolean> {
	const key = getAccessSecret();
	if (!key) return false;
	try {
		await jwtVerify(token, key, { algorithms: ["HS256"] });
		return true;
	} catch {
		return false;
	}
}

async function resolveAuthState(
	request: NextRequest,
): Promise<"authenticated" | "may-refresh" | "anonymous"> {
	const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
	if (accessToken && (await hasValidAccessToken(accessToken))) {
		return "authenticated";
	}
	if (request.cookies.has(REFRESH_COOKIE)) return "may-refresh";
	return "anonymous";
}

function buildLoginRedirect(request: NextRequest, pathname: string): URL {
	const url = new URL("/login", request.url);
	const original = `${pathname}${request.nextUrl.search}`;
	if (original && original !== "/" && original !== "/login") {
		url.searchParams.set("next", original);
	}
	return url;
}

function buildRefreshRedirect(request: NextRequest, fallbackNext: string): URL {
	const url = new URL("/api/auth/refresh", request.url);
	const next = request.nextUrl.searchParams.get("next") ?? fallbackNext;
	if (next?.startsWith("/") && !next.startsWith("//")) {
		url.searchParams.set("next", next);
	}
	return url;
}

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const state = await resolveAuthState(request);

	// Only a verified access token counts as authenticated here. A refresh
	// cookie alone can be stale, so /api/auth/refresh verifies it before the
	// user is allowed through or sent back to /login.
	const isAuthenticated = state === "authenticated";
	const canAttemptRefresh = state === "may-refresh";

	if (isAuthenticated && AUTH_ROUTES.includes(pathname)) {
		const next = request.nextUrl.searchParams.get("next");

		if (next?.startsWith("/") && !next.startsWith("//")) {
			return NextResponse.redirect(new URL(next, request.url));
		}

		return NextResponse.redirect(new URL("/", request.url));
	}

	if (canAttemptRefresh && AUTH_ROUTES.includes(pathname)) {
		return NextResponse.redirect(buildRefreshRedirect(request, "/"));
	}

	if (!isAuthenticated && isProtectedRoute(pathname)) {
		if (canAttemptRefresh) {
			const original = `${pathname}${request.nextUrl.search}`;
			return NextResponse.redirect(
				buildRefreshRedirect(request, original),
			);
		}
		return NextResponse.redirect(buildLoginRedirect(request, pathname));
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|robots.txt|icons).*)",
	],
};
