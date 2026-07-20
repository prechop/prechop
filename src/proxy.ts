import { jwtVerify } from "jose";
import { type NextRequest, NextResponse } from "next/server";

// Page-shell gate (Next 16 `proxy`, formerly `middleware`). Runs on every
// non-API request. It exists to suppress empty authenticated shells and to
// keep auth-only routes out of search indexes — the real data gate lives at
// the API layer in `withAuth`.
//
// Prechop identity is passwordless email/Google; the auth entry page is /login.
// The JWT carries just the userId (role/campus are resolved server-side), so
// this gate cannot route by role — it only distinguishes authenticated from
// anonymous. Post-login role routing happens in the client boot path.

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

// Cookie names mirror src/server/lib/cookies.ts — kept in lockstep because
// the proxy runs at the edge and cannot import server-only modules.
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

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const state = await resolveAuthState(request);
	const isAuthenticated = state !== "anonymous";

	// Already signed in and visiting /login → send home; the home page routes
	// the user to their role dashboard.
	if (isAuthenticated && AUTH_ROUTES.includes(pathname)) {
		const next = request.nextUrl.searchParams.get("next");
		if (next?.startsWith("/") && !next.startsWith("//")) {
			return NextResponse.redirect(new URL(next, request.url));
		}
		return NextResponse.redirect(new URL("/", request.url));
	}

	if (!isAuthenticated && isProtectedRoute(pathname)) {
		return NextResponse.redirect(buildLoginRedirect(request, pathname));
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|robots.txt|icons).*)",
	],
};
