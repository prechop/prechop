import { BUILTIN_GROUPS, BUILTIN_POLICIES } from "../../constants";
import {
	getGroupByNameDB,
	getPolicyByNameDB,
	upsertBuiltInGroupDB,
	upsertBuiltInPolicyDB,
} from "../../models";
import { bumpPermVersion } from "./resolvePermissions";

/**
 * Idempotently create/refresh every built-in policy and group. Safe to run on
 * every boot and from the seed script. Returns a name→id map for both.
 */
export async function seedBuiltInIam(): Promise<{
	policyIds: Record<string, string>;
	groupIds: Record<string, string>;
}> {
	const policyIds: Record<string, string> = {};
	for (const [name, def] of Object.entries(BUILTIN_POLICIES)) {
		const policy = await upsertBuiltInPolicyDB({
			name,
			description: def.description,
			statements: def.statements,
		});
		if (policy) policyIds[name] = (policy.id ?? policy._id).toString();
	}

	const groupIds: Record<string, string> = {};
	for (const [name, def] of Object.entries(BUILTIN_GROUPS)) {
		const group = await upsertBuiltInGroupDB({
			name,
			description: def.description,
			policyIds: def.policies
				.map((p) => policyIds[p])
				.filter((id): id is string => !!id),
		});
		if (group) groupIds[name] = (group.id ?? group._id).toString();
	}

	await bumpPermVersion();
	return { policyIds, groupIds };
}

/** Resolve a built-in group id by name (used by registration). */
export async function getBuiltInGroupId(name: string): Promise<string | null> {
	const group = await getGroupByNameDB({ name });
	return group ? (group.id ?? group._id).toString() : null;
}

/** Resolve a built-in policy id by name. */
export async function getBuiltInPolicyId(name: string): Promise<string | null> {
	const policy = await getPolicyByNameDB({ name });
	return policy ? (policy.id ?? policy._id).toString() : null;
}
