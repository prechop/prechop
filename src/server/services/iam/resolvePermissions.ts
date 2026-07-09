import { ALL_ACTIONS } from "../../constants";
import {
	Redis,
	redisRetrieveKeyString,
	redisUpdateKeyString,
} from "../../databases/redis";
import {
	bumpPermVersionDB,
	getPermVersionDB,
	getUserByIdDB,
	type IPolicyStatement,
	listGroupsDB,
	listPoliciesDB,
} from "../../models";
import { listAllowedActions } from "./can";

const PERMV_KEY = "iam:permv";
const PERMS_TTL_SECONDS = 300;

export interface ResolvedPermissions {
	statements: IPolicyStatement[];
	/** Group names the user belongs to (for audit labels & UI). */
	groups: string[];
	/** Concrete allowed action strings (for client UI gating). */
	actions: string[];
	version: number;
}

/** Best-effort Redis read; never throws (cache is an optimization only). */
async function safeGet<T>(key: string): Promise<T | undefined> {
	try {
		return await redisRetrieveKeyString<T>(key);
	} catch {
		return undefined;
	}
}

async function safeSet<T>(
	key: string,
	value: T,
	ttlSeconds?: number,
): Promise<void> {
	try {
		await redisUpdateKeyString(
			key,
			value,
			ttlSeconds !== undefined,
			ttlSeconds,
		);
	} catch {
		// ignore
	}
}

/** Current global permission version (Redis-cached, Mongo-authoritative). */
export async function getPermVersion(): Promise<number> {
	const cached = await safeGet<number>(PERMV_KEY);
	if (typeof cached === "number") return cached;
	const v = await getPermVersionDB();
	await safeSet(PERMV_KEY, v, undefined); // no expiry — invalidated on bump
	return v;
}

/**
 * Bump the global permission version. Invalidates every user's resolved-perms
 * cache in one operation (their cache keys embed the old version). Call after
 * any group/policy/attachment change.
 */
export async function bumpPermVersion(): Promise<number> {
	const v = await bumpPermVersionDB();
	await safeSet(PERMV_KEY, v, undefined);
	return v;
}

/**
 * Resolve a user's effective permissions: the union of statements from every
 * policy attached to their groups plus their directly-attached policies.
 * Cached in Redis under the current permVersion.
 */
export async function resolvePermissions(
	userId: string,
): Promise<ResolvedPermissions> {
	const version = await getPermVersion();
	const cacheKey = `iam:perms:${userId}:${version}`;

	const cached = await safeGet<ResolvedPermissions>(cacheKey);
	if (cached) return cached;

	const user = await getUserByIdDB({ id: userId });
	if (!user) {
		return { statements: [], groups: [], actions: [], version };
	}

	const groups = await listGroupsDB({ ids: user.groupIds ?? [] });
	const groupPolicyIds = groups.flatMap((g) =>
		(g.policyIds ?? []).map((p) => p.toString()),
	);
	const allPolicyIds = Array.from(
		new Set([
			...groupPolicyIds,
			...(user.directPolicyIds ?? []).map((p) => p.toString()),
		]),
	);

	const policies = allPolicyIds.length
		? await listPoliciesDB({ ids: allPolicyIds })
		: [];
	const statements = policies.flatMap((p) => p.statements ?? []);

	const resolved: ResolvedPermissions = {
		statements,
		groups: groups.map((g) => g.name),
		actions: listAllowedActions(statements, ALL_ACTIONS),
		version,
	};
	await safeSet(cacheKey, resolved, PERMS_TTL_SECONDS);
	return resolved;
}

/**
 * Resolve the statement set for an arbitrary attachment set (no user lookup, no
 * cache). Used to evaluate a *prospective* set of groups/policies before saving,
 * e.g. the self-lockout guard.
 */
export async function resolveStatementsForAttachments(
	groupIds: string[],
	directPolicyIds: string[],
): Promise<IPolicyStatement[]> {
	const groups = await listGroupsDB({ ids: groupIds });
	const groupPolicyIds = groups.flatMap((g) =>
		(g.policyIds ?? []).map((p) => p.toString()),
	);
	const allPolicyIds = Array.from(
		new Set([...groupPolicyIds, ...directPolicyIds]),
	);
	const policies = allPolicyIds.length
		? await listPoliciesDB({ ids: allPolicyIds })
		: [];
	return policies.flatMap((p) => p.statements ?? []);
}

/** Drop a single user's cached permissions across all versions (best-effort). */
export async function invalidateUserPermissions(userId: string): Promise<void> {
	try {
		const keys = await Redis.keys(`iam:perms:${userId}:*`);
		if (keys.length) await Redis.del(keys);
	} catch {
		// ignore
	}
}
