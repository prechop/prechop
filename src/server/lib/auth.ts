import "server-only";
import type { NextRequest } from "next/server";
import { decodeJwtToken, ErrForbidden, ErrUnauthorized } from "../constants";
import { getUserByIdDB, UserRole } from "../models";
import reLoginUserWithRefreshToken from "../services/auth/reLoginUserWithRefreshToken";
import type { IJwtPayload } from "../types";
import { getClientIp } from "./clientIp";
import {
	ACCESS_COOKIE,
	clearAuthCookies,
	getCookieValue,
	REFRESH_COOKIE,
	setAuthCookies,
} from "./cookies";

export interface AuthResult {
	userId: string;
	token: IJwtPayload;
	/** True when the access token was refreshed during this request. */
	refreshed: boolean;
	role: UserRole;
	campusId: string;
	isActive: boolean;
}

function readAccessToken(req: Request | NextRequest, cookieVal: string | null) {
	if (cookieVal) return cookieVal;
	const header = req.headers.get("authorization");
	if (!header) return null;
	return header.replace("Bearer ", "");
}

async function resolveScope(userId: string): Promise<{
	role: UserRole;
	campusId: string;
	isActive: boolean;
}> {
	const user = await getUserByIdDB({ id: userId });
	if (!user) throw ErrUnauthorized;
	if (!user.isActive) throw ErrUnauthorized;
	return {
		role: user.role,
		campusId: user.campusId?.toString() ?? "",
		isActive: user.isActive,
	};
}

/**
 * Verify the current request's auth. Refreshes the access token from the
 * refresh token if necessary. Throws on any failure.
 */
export async function verifyAuthToken(
	req: Request | NextRequest,
): Promise<AuthResult> {
	const accessFromCookie = await getCookieValue(ACCESS_COOKIE);
	const accessToken = readAccessToken(req, accessFromCookie);

	const decodedAccess = accessToken
		? await decodeJwtToken({ accessToken }).catch(() => null)
		: null;

	if (decodedAccess) {
		const scope = await resolveScope(decodedAccess.userId);
		return {
			userId: decodedAccess.userId,
			token: decodedAccess,
			refreshed: false,
			...scope,
		};
	}

	const refreshToken = await getCookieValue(REFRESH_COOKIE);
	if (!refreshToken) throw ErrUnauthorized;

	const decodedRefresh = await decodeJwtToken({ refreshToken }).catch(
		() => null,
	);
	if (!decodedRefresh) throw ErrUnauthorized;

	const next = await reLoginUserWithRefreshToken({
		id: decodedRefresh.userId,
		refreshToken,
		ip: decodedRefresh.ip || getClientIp(req),
	});
	if (!next) throw ErrUnauthorized;

	const scope = await resolveScope(decodedRefresh.userId);
	return {
		userId: decodedRefresh.userId,
		token: next,
		refreshed: true,
		...scope,
	};
}

// ── Role guards ─────────────────────────────────────────────────────────────

export function assertRole(auth: AuthResult, roles: UserRole[]): void {
	if (!roles.includes(auth.role)) throw ErrForbidden;
}

export function assertAdmin(auth: AuthResult): void {
	if (auth.role !== UserRole.SUPER_ADMIN) throw ErrForbidden;
}

export function assertVendor(auth: AuthResult): void {
	if (auth.role !== UserRole.VENDOR) throw ErrForbidden;
}

export function assertBuyer(auth: AuthResult): void {
	if (auth.role !== UserRole.BUYER) throw ErrForbidden;
}

// ── withAuth wrapper ─────────────────────────────────────────────────────────

export type AuthedHandler<TCtx = unknown> = (args: {
	req: NextRequest;
	auth: AuthResult;
	context: TCtx;
}) => Promise<Response> | Response;

export function withAuth<TCtx = unknown>(
	handler: AuthedHandler<TCtx>,
): (args: { req: NextRequest; context: TCtx }) => Promise<Response> {
	return async ({ req, context }) => {
		let auth: AuthResult;
		try {
			auth = await verifyAuthToken(req);
		} catch (error) {
			await clearAuthCookies();
			const { handleError } = await import("./response");
			return handleError(error);
		}
		const response = await handler({ req, auth, context });
		if (auth.refreshed) {
			await setAuthCookies(auth.token);
		}
		return response;
	};
}
