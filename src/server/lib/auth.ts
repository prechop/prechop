import "server-only";

import type { NextRequest } from "next/server";

import {
	ADMINISTRATORS_GROUP,
	decodeJwtToken,
	ErrForbidden,
	ErrUnauthorized,
	ErrVendorNotActive,
} from "../constants";

import {
	getUserByIdDB,
	getVendorProfileByUserIdDB,
	type IPolicyStatement,
	type IVendorProfile,
	listGroupsDB,
	VendorStatus,
} from "../models";

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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthResult {
	userId: string;
	token: IJwtPayload;

	/** True when the access token was refreshed during this request. */
	refreshed: boolean;

	campusId: string;
	isActive: boolean;

	/** Names of the IAM groups the user belongs to. */
	groups: string[];

	/** Concrete allowed action strings. */
	permissions: string[];

	/** Resolved policy statements used by `requirePermission`. */
	statements: IPolicyStatement[];
}

export type AuthUserLike = {
	userId?: string;
	id?: string;
	groups?: Array<string | null | undefined>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Safe logging helpers
// ─────────────────────────────────────────────────────────────────────────────

function describeError(error: unknown): {
	name: string;
	message: string;
	code?: string;
} {
	let code: string | undefined;

	if (typeof error === "object" && error !== null && "code" in error) {
		code = String(error.code);
	}

	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			code,
		};
	}

	return {
		name: typeof error,
		message: String(error),
		code,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Request token helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a cookie directly from the supplied Request.
 *
 * This is important for Server Components/layouts where a Request is manually
 * constructed using the incoming request headers.
 */
function readCookieFromRequest(
	req: Request | NextRequest,
	cookieName: string,
): string | null {
	const cookieHeader = req.headers.get("cookie");

	if (!cookieHeader) {
		return null;
	}

	for (const rawCookie of cookieHeader.split(";")) {
		const [name, ...valueParts] = rawCookie.trim().split("=");

		if (name !== cookieName) {
			continue;
		}

		const rawValue = valueParts.join("=");

		if (!rawValue) {
			return null;
		}

		try {
			return decodeURIComponent(rawValue);
		} catch {
			return rawValue;
		}
	}

	return null;
}

/**
 * Read a Bearer access token from the Authorization header.
 */
function readBearerToken(req: Request | NextRequest): string | null {
	const authorization = req.headers.get("authorization");

	if (!authorization) {
		return null;
	}

	const match = authorization.match(/^Bearer\s+(.+)$/i);

	return match?.[1]?.trim() || null;
}

/**
 * Safely read a cookie using Next.js's current request context.
 *
 * This remains a fallback for existing route handlers. Direct request-cookie
 * extraction is preferred when a Request was explicitly supplied.
 */
async function readContextCookie(cookieName: string): Promise<string | null> {
	try {
		return await getCookieValue(cookieName);
	} catch (error) {
		console.warn("[auth] context cookie read failed", {
			cookieName,
			...describeError(error),
		});

		return null;
	}
}

/**
 * Read the access token in this order:
 *
 * 1. Cookie header on the supplied request
 * 2. Next.js current request cookie context
 * 3. Authorization Bearer header
 */
async function readAccessToken(req: Request | NextRequest): Promise<{
	token: string | null;
	source: "request-cookie" | "context-cookie" | "bearer" | "none";
}> {
	const requestCookie = readCookieFromRequest(req, ACCESS_COOKIE);

	if (requestCookie) {
		return {
			token: requestCookie,
			source: "request-cookie",
		};
	}

	const contextCookie = await readContextCookie(ACCESS_COOKIE);

	if (contextCookie) {
		return {
			token: contextCookie,
			source: "context-cookie",
		};
	}

	const bearerToken = readBearerToken(req);

	if (bearerToken) {
		return {
			token: bearerToken,
			source: "bearer",
		};
	}

	return {
		token: null,
		source: "none",
	};
}

/**
 * Read the refresh token from the supplied request first, then fall back to
 * Next.js's current request cookie context.
 */
async function readRefreshToken(req: Request | NextRequest): Promise<{
	token: string | null;
	source: "request-cookie" | "context-cookie" | "none";
}> {
	const requestCookie = readCookieFromRequest(req, REFRESH_COOKIE);

	if (requestCookie) {
		return {
			token: requestCookie,
			source: "request-cookie",
		};
	}

	const contextCookie = await readContextCookie(REFRESH_COOKIE);

	if (contextCookie) {
		return {
			token: contextCookie,
			source: "context-cookie",
		};
	}

	return {
		token: null,
		source: "none",
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// IAM scope resolution
// ─────────────────────────────────────────────────────────────────────────────

async function resolveUserGroupNamesFromUser(user: {
	groupIds?: unknown[];
}): Promise<string[]> {
	const groupIds = (user.groupIds ?? [])
		.map((groupId) => String(groupId))
		.filter(Boolean);

	console.info("[auth] resolving group names", {
		groupIdCount: groupIds.length,
	});

	if (groupIds.length === 0) {
		return [];
	}

	const groups = await listGroupsDB({
		ids: groupIds,
	});

	const groupNames = groups.map((group) => group.name);

	console.info("[auth] group names resolved", {
		requestedGroupCount: groupIds.length,
		resolvedGroupCount: groupNames.length,
		groupNames,
	});

	return groupNames;
}

export async function resolveUserGroupNames(userId: string): Promise<string[]> {
	console.info("[auth] loading user groups", {
		userId,
	});

	const user = await getUserByIdDB({
		id: userId,
	});

	if (!user) {
		console.warn("[auth] user not found while resolving groups", {
			userId,
		});

		return [];
	}

	return resolveUserGroupNamesFromUser(user);
}

async function resolveScope(userId: string): Promise<{
	campusId: string;
	isActive: boolean;
	groups: string[];
	permissions: string[];
	statements: IPolicyStatement[];
}> {
	console.info("[auth] resolving scope", {
		userId,
	});

	const user = await getUserByIdDB({
		id: userId,
	});

	if (!user) {
		console.warn("[auth] scope rejected: user not found", {
			userId,
		});

		throw ErrUnauthorized;
	}

	if (!user.isActive) {
		console.warn("[auth] scope rejected: user inactive", {
			userId,
		});

		throw ErrUnauthorized;
	}

	try {
		const [resolved, groups] = await Promise.all([
			resolvePermissions(userId),
			resolveUserGroupNamesFromUser(user),
		]);

		const scope = {
			campusId: user.campusId?.toString() ?? "",
			isActive: user.isActive,
			groups,
			permissions: resolved.actions,
			statements: resolved.statements,
		};

		console.info("[auth] scope resolved", {
			userId,
			campusIdPresent: Boolean(scope.campusId),
			isActive: scope.isActive,
			groups: scope.groups,
			permissionCount: scope.permissions.length,
			statementCount: scope.statements.length,
		});

		return scope;
	} catch (error) {
		console.error("[auth] scope resolution failed", {
			userId,
			...describeError(error),
		});

		throw error;
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Authentication
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify the current request's authentication.
 *
 * It first checks the access token. When the access token cannot be used, it
 * attempts to authenticate through the refresh token.
 *
 * Callers receiving `refreshed: true` must persist `auth.token` using
 * `setAuthCookies` from a Route Handler or other cookie-writing context.
 */
export async function verifyAuthToken(
	req: Request | NextRequest,
): Promise<AuthResult> {
	console.info("[verifyAuthToken] started", {
		method: req.method,
		hasCookieHeader: Boolean(req.headers.get("cookie")),
		hasAuthorizationHeader: Boolean(req.headers.get("authorization")),
	});

	// ── Access token ──────────────────────────────────────────────────────────

	const access = await readAccessToken(req);

	console.info("[verifyAuthToken] access token located", {
		present: Boolean(access.token),
		source: access.source,
		length: access.token?.length ?? 0,
	});

	if (access.token) {
		try {
			const decodedAccess = await decodeJwtToken({
				accessToken: access.token,
			});

			if (!decodedAccess) {
				console.warn("[verifyAuthToken] access token decoded to null", {
					source: access.source,
				});
			} else {
				console.info("[verifyAuthToken] access token decoded", {
					userId: decodedAccess.userId,
					tokenKeys: Object.keys(decodedAccess),
				});

				const scope = await resolveScope(decodedAccess.userId);

				console.info(
					"[verifyAuthToken] access authentication succeeded",
					{
						userId: decodedAccess.userId,
						groups: scope.groups,
					},
				);

				return {
					userId: decodedAccess.userId,
					token: decodedAccess,
					refreshed: false,
					...scope,
				};
			}
		} catch (error) {
			console.warn("[verifyAuthToken] access token rejected", {
				source: access.source,
				...describeError(error),
			});
		}
	}

	// ── Refresh-token fallback ────────────────────────────────────────────────

	console.info("[verifyAuthToken] attempting refresh fallback");

	const refresh = await readRefreshToken(req);

	console.info("[verifyAuthToken] refresh token located", {
		present: Boolean(refresh.token),
		source: refresh.source,
		length: refresh.token?.length ?? 0,
	});

	if (!refresh.token) {
		console.warn("[verifyAuthToken] authentication rejected", {
			reason: "refresh-token-missing",
		});

		throw ErrUnauthorized;
	}

	let decodedRefresh: IJwtPayload;

	try {
		const decoded = await decodeJwtToken({
			refreshToken: refresh.token,
		});

		if (!decoded) {
			console.warn("[verifyAuthToken] refresh token decoded to null", {
				source: refresh.source,
			});

			throw ErrUnauthorized;
		}

		decodedRefresh = decoded;

		console.info("[verifyAuthToken] refresh token decoded", {
			userId: decodedRefresh.userId,
			hasIpClaim: Boolean(decodedRefresh.ip),
			tokenKeys: Object.keys(decodedRefresh),
		});
	} catch (error) {
		console.warn("[verifyAuthToken] refresh token rejected", {
			source: refresh.source,
			...describeError(error),
		});

		throw ErrUnauthorized;
	}

	let next: IJwtPayload | null;

	try {
		next = await reLoginUserWithRefreshToken({
			id: decodedRefresh.userId,
			refreshToken: refresh.token,
			ip: decodedRefresh.ip || getClientIp(req),
		});
	} catch (error) {
		console.error("[verifyAuthToken] refresh login threw", {
			userId: decodedRefresh.userId,
			...describeError(error),
		});

		throw error;
	}

	if (!next) {
		console.warn("[verifyAuthToken] refresh session rejected", {
			userId: decodedRefresh.userId,
			reason: "refresh-service-returned-null",
		});

		throw ErrUnauthorized;
	}

	console.info("[verifyAuthToken] refresh login succeeded", {
		userId: decodedRefresh.userId,
	});

	const scope = await resolveScope(decodedRefresh.userId);

	console.info("[verifyAuthToken] refreshed authentication succeeded", {
		userId: decodedRefresh.userId,
		groups: scope.groups,
	});

	return {
		userId: decodedRefresh.userId,
		token: next,
		refreshed: true,
		...scope,
	};
}

/**
 * Verify only the current access token.
 *
 * Server-rendered page gates must use this instead of `verifyAuthToken` because
 * they cannot safely persist a rotated refresh token back to the browser.
 */
export async function verifyAccessTokenOnly(
	req: Request | NextRequest,
): Promise<AuthResult> {
	const access = await readAccessToken(req);

	if (!access.token) {
		throw ErrUnauthorized;
	}

	const decodedAccess = await decodeJwtToken({
		accessToken: access.token,
	}).catch(() => null);

	if (!decodedAccess) {
		throw ErrUnauthorized;
	}

	const scope = await resolveScope(decodedAccess.userId);

	return {
		userId: decodedAccess.userId,
		token: decodedAccess,
		refreshed: false,
		...scope,
	};
}

/**
 * Best-effort caller identity for otherwise-public endpoints.
 *
 * Reads and decodes only the access token. It deliberately does not use the
 * refresh token because this function cannot safely persist rotated cookies.
 */
export async function optionalUserId(
	req: Request | NextRequest,
): Promise<string | undefined> {
	const access = await readAccessToken(req);

	if (!access.token) {
		return undefined;
	}

	try {
		const decoded = await decodeJwtToken({
			accessToken: access.token,
		});

		if (!decoded) {
			console.info("[optionalUserId] access token decoded to null", {
				source: access.source,
			});

			return undefined;
		}

		return decoded.userId;
	} catch (error) {
		console.info("[optionalUserId] access token ignored", {
			source: access.source,
			...describeError(error),
		});

		return undefined;
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission guards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Throw `ErrForbidden` unless the caller's policies permit `action`.
 */
export function requirePermission(
	auth: AuthResult,
	action: string,
	ctx: PermissionContext = {},
): void {
	const context: PermissionContext = {
		...ctx,
		user: {
			campusId: auth.campusId,
			...(ctx.user ?? {}),
		},
	};

	const allowed = can(auth.statements, action, context);

	console.info("[requirePermission]", {
		userId: auth.userId,
		action,
		allowed,
		statementCount: auth.statements.length,
	});

	if (!allowed) {
		throw ErrForbidden;
	}
}

/**
 * Non-throwing permission check.
 */
export function hasPermission(
	auth: AuthResult,
	action: string,
	ctx: PermissionContext = {},
): boolean {
	const context: PermissionContext = {
		...ctx,
		user: {
			campusId: auth.campusId,
			...(ctx.user ?? {}),
		},
	};

	return can(auth.statements, action, context);
}

/**
 * Membership check against an exact IAM group name.
 */
export function isInGroup(auth: AuthResult, groupName: string): boolean {
	return auth.groups.includes(groupName);
}

// ─────────────────────────────────────────────────────────────────────────────
// App-role guards
// ─────────────────────────────────────────────────────────────────────────────

export function assertVendor(auth: AuthResult): void {
	requirePermission(auth, "vendorApp:manage");
}

/**
 * Assert that the caller is an approved and active vendor.
 */
export async function assertActiveVendor(
	auth: AuthResult,
): Promise<IVendorProfile> {
	assertVendor(auth);

	const vendor = await getVendorProfileByUserIdDB({
		userId: auth.userId,
	});

	if (!vendor) {
		console.warn("[assertActiveVendor] vendor profile missing", {
			userId: auth.userId,
		});

		throw ErrForbidden;
	}

	if (vendor.status !== VendorStatus.ACTIVE) {
		console.warn("[assertActiveVendor] vendor not active", {
			userId: auth.userId,
			status: vendor.status,
		});

		throw ErrVendorNotActive;
	}

	return vendor;
}

export function assertBuyer(auth: AuthResult): void {
	requirePermission(auth, "buyer:order:read");
}

export function assertAdministrator(auth: AuthResult): void {
	const allowed = isInGroup(auth, ADMINISTRATORS_GROUP);

	console.info("[assertAdministrator]", {
		userId: auth.userId,
		requiredGroup: ADMINISTRATORS_GROUP,
		resolvedGroups: auth.groups,
		allowed,
	});

	if (!allowed) {
		throw ErrForbidden;
	}
}

/**
 * Audit label derived from group memberships.
 */
export function auditRoleLabel(auth: AuthResult): string {
	return auth.groups.join(",");
}

// ─────────────────────────────────────────────────────────────────────────────
// withAuth wrapper
// ─────────────────────────────────────────────────────────────────────────────

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
			console.warn("[withAuth] authentication failed", {
				...describeError(error),
			});

			await clearAuthCookies();

			const { handleError } = await import("./response");

			return handleError(error);
		}

		let response: Response;

		try {
			response = await handler({
				req,
				auth,
				context,
			});
		} catch (error) {
			console.error("[withAuth] authenticated handler failed", {
				userId: auth.userId,
				...describeError(error),
			});

			throw error;
		}

		if (auth.refreshed) {
			console.info("[withAuth] persisting refreshed cookies", {
				userId: auth.userId,
			});

			try {
				await setAuthCookies(auth.token);

				console.info("[withAuth] refreshed cookies persisted", {
					userId: auth.userId,
				});
			} catch (error) {
				console.error(
					"[withAuth] refreshed cookie persistence failed",
					{
						userId: auth.userId,
						...describeError(error),
					},
				);

				throw error;
			}
		}

		return response;
	};
}

// import "server-only";
// import type { NextRequest } from "next/server";
// import {
//   ADMINISTRATORS_GROUP,
//   decodeJwtToken,
//   ErrForbidden,
//   ErrUnauthorized,
//   ErrVendorNotActive,
// } from "../constants";
// import {
//   getUserByIdDB,
//   getVendorProfileByUserIdDB,
//   listGroupsDB,
//   type IPolicyStatement,
//   type IVendorProfile,
//   VendorStatus,
// } from "../models";
// import reLoginUserWithRefreshToken from "../services/auth/reLoginUserWithRefreshToken";
// import {
//   can,
//   type PermissionContext,
//   resolvePermissions,
// } from "../services/iam";
// import type { IJwtPayload } from "../types";
// import { getClientIp } from "./clientIp";
// import {
//   ACCESS_COOKIE,
//   clearAuthCookies,
//   getCookieValue,
//   REFRESH_COOKIE,
//   setAuthCookies,
// } from "./cookies";

// export interface AuthResult {
//   userId: string;
//   token: IJwtPayload;
//   /** True when the access token was refreshed during this request. */
//   refreshed: boolean;
//   campusId: string;
//   isActive: boolean;
//   /** Names of the IAM groups the user belongs to (for audit labels & UI). */
//   groups: string[];
//   /** Concrete allowed action strings (for coarse UI-style checks). */
//   permissions: string[];
//   /** Resolved policy statements — the source of truth for `requirePermission`. */
//   statements: IPolicyStatement[];
// }

// function readAccessToken(req: Request | NextRequest, cookieVal: string | null) {
//   if (cookieVal) return cookieVal;
//   const header = req.headers.get("authorization");
//   if (!header) return null;
//   return header.replace("Bearer ", "");
// }

// async function resolveUserGroupNamesFromUser(user: {
//   groupIds?: unknown[];
// }): Promise<string[]> {
//   const groupIds = (user.groupIds ?? []).map((groupId) => String(groupId));
//   const groups = await listGroupsDB({ ids: groupIds });
//   return groups.map((group) => group.name);
// }

// export async function resolveUserGroupNames(userId: string): Promise<string[]> {
//   const user = await getUserByIdDB({ id: userId });
//   if (!user) return [];
//   return resolveUserGroupNamesFromUser(user);
// }

// async function resolveScope(userId: string): Promise<{
//   campusId: string;
//   isActive: boolean;
//   groups: string[];
//   permissions: string[];
//   statements: IPolicyStatement[];
// }> {
//   const user = await getUserByIdDB({ id: userId });
//   if (!user) throw ErrUnauthorized;
//   if (!user.isActive) throw ErrUnauthorized;
//   const [resolved, groups] = await Promise.all([
//     resolvePermissions(userId),
//     resolveUserGroupNamesFromUser(user),
//   ]);
//   return {
//     campusId: user.campusId?.toString() ?? "",
//     isActive: user.isActive,
//     groups,
//     permissions: resolved.actions,
//     statements: resolved.statements,
//   };
// }

// /**
//  * Verify the current request's auth. Refreshes the access token from the
//  * refresh token if necessary. Throws on any failure.
//  */
// export async function verifyAuthToken(
//   req: Request | NextRequest,
// ): Promise<AuthResult> {
//   const accessFromCookie = await getCookieValue(ACCESS_COOKIE);
//   const accessToken = readAccessToken(req, accessFromCookie);

//   const decodedAccess = accessToken
//     ? await decodeJwtToken({ accessToken }).catch(() => null)
//     : null;

//   if (decodedAccess) {
//     const scope = await resolveScope(decodedAccess.userId);
//     return {
//       userId: decodedAccess.userId,
//       token: decodedAccess,
//       refreshed: false,
//       ...scope,
//     };
//   }

//   const refreshToken = await getCookieValue(REFRESH_COOKIE);
//   if (!refreshToken) throw ErrUnauthorized;

//   const decodedRefresh = await decodeJwtToken({ refreshToken }).catch(
//     () => null,
//   );
//   if (!decodedRefresh) throw ErrUnauthorized;

//   const next = await reLoginUserWithRefreshToken({
//     id: decodedRefresh.userId,
//     refreshToken,
//     ip: decodedRefresh.ip || getClientIp(req),
//   });
//   if (!next) throw ErrUnauthorized;

//   const scope = await resolveScope(decodedRefresh.userId);
//   return {
//     userId: decodedRefresh.userId,
//     token: next,
//     refreshed: true,
//     ...scope,
//   };
// }

// /**
//  * Best-effort caller identity for otherwise-public endpoints. Reads and decodes
//  * the access token only — it deliberately does NOT fall back to the refresh
//  * token (that path rotates the refresh token, and since this runs outside
//  * `withAuth` we couldn't persist the new cookie, which would silently log the
//  * user out). Returns the userId when a valid access token is present, else
//  * undefined. Never throws. Used to personalise public reads (e.g. hide a
//  * vendor's own listings from the marketplace) without gating anonymous access.
//  */
// export async function optionalUserId(
//   req: Request | NextRequest,
// ): Promise<string | undefined> {
//   const accessFromCookie = await getCookieValue(ACCESS_COOKIE);
//   const accessToken = readAccessToken(req, accessFromCookie);
//   if (!accessToken) return undefined;
//   const decoded = await decodeJwtToken({ accessToken }).catch(() => null);
//   return decoded?.userId;
// }

// // ── Permission guards ────────────────────────────────────────────────────────

// /**
//  * Throw `ErrForbidden` unless the caller's resolved policies permit `action`.
//  * The caller's own `campusId` is injected into the condition context so
//  * campus-scoped policies (`{ campusId: "$user.campusId" }`) evaluate correctly.
//  */
// export function requirePermission(
//   auth: AuthResult,
//   action: string,
//   ctx: PermissionContext = {},
// ): void {
//   const context: PermissionContext = {
//     ...ctx,
//     user: { campusId: auth.campusId, ...(ctx.user ?? {}) },
//   };
//   if (!can(auth.statements, action, context)) throw ErrForbidden;
// }

// /** Non-throwing capability check (for branching, not gating). */
// export function hasPermission(
//   auth: AuthResult,
//   action: string,
//   ctx: PermissionContext = {},
// ): boolean {
//   const context: PermissionContext = {
//     ...ctx,
//     user: { campusId: auth.campusId, ...(ctx.user ?? {}) },
//   };
//   return can(auth.statements, action, context);
// }

// /** Membership check against a group name. */
// export function isInGroup(auth: AuthResult, groupName: string): boolean {
//   return auth.groups.includes(groupName);
// }

// // ── App-role guards (re-expressed as permission probes) ──────────────────────
// // These keep the existing call-sites working while sourcing their answer from
// // IAM: every vendor has `vendorApp:manage`, every buyer has `buyer:order:read`.

// export function assertVendor(auth: AuthResult): void {
//   requirePermission(auth, "vendorApp:manage");
// }

// /**
//  * Assert the caller is a vendor whose application has been approved (status
//  * ACTIVE), and return their profile. Unverified vendors (INCOMPLETE,
//  * PENDING_REVIEW, CHANGES_REQUESTED) and SUSPENDED vendors are rejected with
//  * `ErrVendorNotActive` — this is the authoritative gate behind the client-side
//  * `VendorStatusGate`: it stops a not-yet-approved vendor from mutating their
//  * menu, timetable, or listings by calling the API directly. Use it on every
//  * vendor *write*; reads keep the lighter `assertVendor`.
//  */
// export async function assertActiveVendor(
//   auth: AuthResult,
// ): Promise<IVendorProfile> {
//   assertVendor(auth);
//   const vendor = await getVendorProfileByUserIdDB({ userId: auth.userId });
//   if (!vendor) throw ErrForbidden;
//   if (vendor.status !== VendorStatus.ACTIVE) throw ErrVendorNotActive;
//   return vendor;
// }

// export function assertBuyer(auth: AuthResult): void {
//   requirePermission(auth, "buyer:order:read");
// }

// // export function assertAdministrator(auth: AuthResult): void {
// //   if (!isInGroup(auth, ADMINISTRATORS_GROUP)) throw ErrForbidden;
// //   // requirePermission(auth, "admin:manage");

// // }
// export function assertAdministrator(auth: AuthResult): void {
//   const allowed = isInGroup(auth, ADMINISTRATORS_GROUP);

//   console.log("[assertAdministrator]", {
//     userId: auth.userId,
//     requiredGroup: ADMINISTRATORS_GROUP,
//     authKeys: Object.keys(auth),
//     allowed,
//   });

//   if (!allowed) {
//     throw ErrForbidden;
//   }
// }

// /** Audit label for an actor derived from their group memberships. */
// export function auditRoleLabel(auth: AuthResult): string {
//   return auth.groups.join(",");
// }

// // ── withAuth wrapper ─────────────────────────────────────────────────────────

// export type AuthedHandler<TCtx = unknown> = (args: {
//   req: NextRequest;
//   auth: AuthResult;
//   context: TCtx;
// }) => Promise<Response> | Response;

// export function withAuth<TCtx = unknown>(
//   handler: AuthedHandler<TCtx>,
// ): (args: { req: NextRequest; context: TCtx }) => Promise<Response> {
//   return async ({ req, context }) => {
//     let auth: AuthResult;
//     try {
//       auth = await verifyAuthToken(req);
//     } catch (error) {
//       await clearAuthCookies();
//       const { handleError } = await import("./response");
//       return handleError(error);
//     }
//     const response = await handler({ req, auth, context });
//     if (auth.refreshed) {
//       await setAuthCookies(auth.token);
//     }
//     return response;
//   };
// }

// export type AuthUserLike = {
//   userId?: string;
//   id?: string;
//   groups?: Array<string | null | undefined>;
// };
