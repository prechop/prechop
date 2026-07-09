import {
	ErrBuiltInImmutable,
	ErrGroupNotFound,
	ErrInvalidFields,
	ErrResourceAlreadyExist,
} from "../../constants";
import {
	createGroupDB,
	getGroupByIdDB,
	getGroupByNameDB,
	type IGroup,
	listGroupsDB,
	listPoliciesDB,
	removeGroupFromAllUsersDB,
	softDeleteGroupDB,
	updateGroupDB,
} from "../../models";
import { recordAudit } from "../audit";
import { bumpPermVersion } from "./resolvePermissions";
import { actorLabel, type IamActor } from "./types";

async function assertPoliciesExist(policyIds: string[]): Promise<void> {
	if (policyIds.length === 0) return;
	const found = await listPoliciesDB({ ids: policyIds });
	if (found.length !== new Set(policyIds).size) throw ErrInvalidFields;
}

export interface GroupWithPolicies extends IGroup {
	policies: { id: string; name: string }[];
}

export async function listGroups(): Promise<GroupWithPolicies[]> {
	const groups = await listGroupsDB();
	const policies = await listPoliciesDB();
	const byId = new Map(policies.map((p) => [(p.id ?? p._id).toString(), p]));
	return groups.map((g) => ({
		...g,
		policies: (g.policyIds ?? []).flatMap((id) => {
			const p = byId.get(id.toString());
			return p ? [{ id: (p.id ?? p._id).toString(), name: p.name }] : [];
		}),
	}));
}

export async function getGroup(id: string): Promise<IGroup> {
	const group = await getGroupByIdDB({ id });
	if (!group) throw ErrGroupNotFound;
	return group;
}

export async function createGroup({
	name,
	description,
	policyIds = [],
	actor,
}: {
	name: string;
	description?: string;
	policyIds?: string[];
	actor: IamActor;
}): Promise<IGroup> {
	if (await getGroupByNameDB({ name })) throw ErrResourceAlreadyExist;
	await assertPoliciesExist(policyIds);

	const group = await createGroupDB({
		payload: { name, description, policyIds, isBuiltIn: false },
	});
	if (!group) throw ErrInvalidFields;

	await bumpPermVersion();
	recordAudit({
		userId: actor.userId,
		role: actorLabel(actor),
		action: "IAM_GROUP_CREATE",
		resourceType: "groups",
		resourceId: (group.id ?? group._id).toString(),
		newState: { name, policyIds },
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});
	return group;
}

export async function updateGroup({
	id,
	description,
	policyIds,
	actor,
}: {
	id: string;
	description?: string;
	policyIds?: string[];
	actor: IamActor;
}): Promise<IGroup> {
	const existing = await getGroupByIdDB({ id });
	if (!existing) throw ErrGroupNotFound;
	if (existing.isBuiltIn) throw ErrBuiltInImmutable;
	if (policyIds) await assertPoliciesExist(policyIds);

	const updated = await updateGroupDB({
		id,
		payload: {
			...(description !== undefined ? { description } : {}),
			...(policyIds !== undefined ? { policyIds } : {}),
		},
	});
	if (!updated) throw ErrGroupNotFound;

	await bumpPermVersion();
	recordAudit({
		userId: actor.userId,
		role: actorLabel(actor),
		action: "IAM_GROUP_UPDATE",
		resourceType: "groups",
		resourceId: id,
		previousState: { policyIds: existing.policyIds },
		newState: { policyIds: updated.policyIds },
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});
	return updated;
}

export async function deleteGroup({
	id,
	actor,
}: {
	id: string;
	actor: IamActor;
}): Promise<{ id: string }> {
	const existing = await getGroupByIdDB({ id });
	if (!existing) throw ErrGroupNotFound;
	if (existing.isBuiltIn) throw ErrBuiltInImmutable;

	await removeGroupFromAllUsersDB({ groupId: id });
	await softDeleteGroupDB({ id });

	await bumpPermVersion();
	recordAudit({
		userId: actor.userId,
		role: actorLabel(actor),
		action: "IAM_GROUP_DELETE",
		resourceType: "groups",
		resourceId: id,
		previousState: { name: existing.name },
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});
	return { id };
}
