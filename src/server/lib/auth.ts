import "server-only";
import type { NextRequest } from "next/server";
import { decodeJwtToken, ErrForbidden, ErrUnauthorized } from "../constants";
import { getUserByIdDB, type IPolicyStatement } from "../models";
import reLoginUserWithRefreshToken from "../services/auth/reLoginUserWithRefreshToken";
import {
	can,
	type PermissionContext,
	resolvePermissions,
} from "../services/iam";
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
	campusId: string;
	isActive: boolean;
	/** Names of the IAM groups the user belongs to (for audit labels & UI). */
	groups: string[];
	/** Concrete allowed action strings (for coarse UI-style checks). */
	permissions: string[];
	/** Resolved policy statements — the source of truth for `requirePermission`. */
	statements: IPolicyStatement[];
}

function readAccessToken(req: Request | NextRequest, cookieVal: string | null) {
	if (cookieVal) return cookieVal;
	const header = req.headers.get("authorization");
	if (!header) return null;
	return header.replace("Bearer ", "");
}

async function resolveScope(userId: string): Promise<{
	campusId: string;
	isActive: boolean;
	groups: string[];
	permissions: string[];
	statements: IPolicyStatement[];
}> {
	const user = await getUserByIdDB({ id: userId });
	if (!user) throw ErrUnauthorized;
	if (!user.isActive) throw ErrUnauthorized;
	const resolved = await resolvePermissions(userId);
	return {
		campusId: user.campusId?.toString() ?? "",
		isActive: user.isActive,
		groups: resolved.groups,
		permissions: resolved.actions,
		statements: resolved.statements,
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

// ── Permission guards ────────────────────────────────────────────────────────

/**
 * Throw `ErrForbidden` unless the caller's resolved policies permit `action`.
 * The caller's own `campusId` is injected into the condition context so
 * campus-scoped policies (`{ campusId: "$user.campusId" }`) evaluate correctly.
 */
export function requirePermission(
	auth: AuthResult,
	action: string,
	ctx: PermissionContext = {},
): void {
	const context: PermissionContext = {
		...ctx,
		user: { campusId: auth.campusId, ...(ctx.user ?? {}) },
	};
	if (!can(auth.statements, action, context)) throw ErrForbidden;
}

/** Non-throwing capability check (for branching, not gating). */
export function hasPermission(
	auth: AuthResult,
	action: string,
	ctx: PermissionContext = {},
): boolean {
	const context: PermissionContext = {
		...ctx,
		user: { campusId: auth.campusId, ...(ctx.user ?? {}) },
	};
	return can(auth.statements, action, context);
}

/** Membership check against a group name. */
export function isInGroup(auth: AuthResult, groupName: string): boolean {
	return auth.groups.includes(groupName);
}

// ── App-role guards (re-expressed as permission probes) ──────────────────────
// These keep the existing call-sites working while sourcing their answer from
// IAM: every vendor has `vendorApp:manage`, every buyer has `buyer:order:read`.

export function assertVendor(auth: AuthResult): void {
	requirePermission(auth, "vendorApp:manage");
}

export function assertBuyer(auth: AuthResult): void {
	requirePermission(auth, "buyer:order:read");
}

/** Audit label for an actor derived from their group memberships. */
export function auditRoleLabel(auth: AuthResult): string {
	return auth.groups.join(",");
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
