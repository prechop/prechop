import {
	ErrBuiltInImmutable,
	ErrInvalidFields,
	ErrPolicyNotFound,
	ErrResourceAlreadyExist,
	isKnownAction,
} from "../../constants";
import {
	createPolicyDB,
	getPolicyByIdDB,
	getPolicyByNameDB,
	type IPolicy,
	type IPolicyStatement,
	listPoliciesDB,
	removePolicyFromAllGroupsDB,
	removePolicyFromAllUsersDB,
	softDeletePolicyDB,
	updatePolicyDB,
} from "../../models";
import { recordAudit } from "../audit";
import { bumpPermVersion } from "./resolvePermissions";
import { actorLabel, type IamActor } from "./types";

/** Reject unknown actions so typos can't silently create dead permissions. */
function validateStatements(statements: IPolicyStatement[]): void {
	if (!Array.isArray(statements) || statements.length === 0)
		throw ErrInvalidFields;
	for (const stmt of statements) {
		if (stmt.effect !== "Allow" && stmt.effect !== "Deny")
			throw ErrInvalidFields;
		if (!Array.isArray(stmt.actions) || stmt.actions.length === 0)
			throw ErrInvalidFields;
		for (const a of stmt.actions) {
			// `*` and `prefix:*` wildcards are allowed; concrete actions must exist.
			if (a === "*" || a.endsWith(":*")) continue;
			if (!isKnownAction(a)) throw ErrInvalidFields;
		}
	}
}

export function listPolicies(): Promise<IPolicy[]> {
	return listPoliciesDB();
}

export async function getPolicy(id: string): Promise<IPolicy> {
	const policy = await getPolicyByIdDB({ id });
	if (!policy) throw ErrPolicyNotFound;
	return policy;
}

export async function createPolicy({
	name,
	description,
	statements,
	actor,
}: {
	name: string;
	description?: string;
	statements: IPolicyStatement[];
	actor: IamActor;
}): Promise<IPolicy> {
	validateStatements(statements);
	if (await getPolicyByNameDB({ name })) throw ErrResourceAlreadyExist;

	const policy = await createPolicyDB({
		payload: { name, description, statements, isBuiltIn: false },
	});
	if (!policy) throw ErrInvalidFields;

	await bumpPermVersion();
	recordAudit({
		userId: actor.userId,
		role: actorLabel(actor),
		action: "IAM_POLICY_CREATE",
		resourceType: "policies",
		resourceId: (policy.id ?? policy._id).toString(),
		newState: { name, statements },
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});
	return policy;
}

export async function updatePolicy({
	id,
	description,
	statements,
	actor,
}: {
	id: string;
	description?: string;
	statements?: IPolicyStatement[];
	actor: IamActor;
}): Promise<IPolicy> {
	const existing = await getPolicyByIdDB({ id });
	if (!existing) throw ErrPolicyNotFound;
	if (existing.isBuiltIn) throw ErrBuiltInImmutable;
	if (statements) validateStatements(statements);

	const updated = await updatePolicyDB({
		id,
		payload: {
			...(description !== undefined ? { description } : {}),
			...(statements !== undefined ? { statements } : {}),
		},
	});
	if (!updated) throw ErrPolicyNotFound;

	await bumpPermVersion();
	recordAudit({
		userId: actor.userId,
		role: actorLabel(actor),
		action: "IAM_POLICY_UPDATE",
		resourceType: "policies",
		resourceId: id,
		previousState: { statements: existing.statements },
		newState: { statements: updated.statements },
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});
	return updated;
}

export async function deletePolicy({
	id,
	actor,
}: {
	id: string;
	actor: IamActor;
}): Promise<{ id: string }> {
	const existing = await getPolicyByIdDB({ id });
	if (!existing) throw ErrPolicyNotFound;
	if (existing.isBuiltIn) throw ErrBuiltInImmutable;

	await removePolicyFromAllGroupsDB({ policyId: id });
	await removePolicyFromAllUsersDB({ policyId: id });
	await softDeletePolicyDB({ id });

	await bumpPermVersion();
	recordAudit({
		userId: actor.userId,
		role: actorLabel(actor),
		action: "IAM_POLICY_DELETE",
		resourceType: "policies",
		resourceId: id,
		previousState: { name: existing.name },
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});
	return { id };
}
