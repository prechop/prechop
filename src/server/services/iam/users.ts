import {
	ADMINISTRATORS_GROUP,
	AppError,
	ErrSelfLockout,
	ErrUserNotFound,
} from "../../constants";
import {
	countUsersInGroupDB,
	getGroupByNameDB,
	getUserByIdDB,
	type IUser,
	listGroupsDB,
	listPoliciesDB,
	listUsersDB,
	setUserDirectPoliciesDB,
	setUserGroupsDB,
} from "../../models";
import { recordAudit } from "../audit";
import { can } from "./can";
import {
	bumpPermVersion,
	invalidateUserPermissions,
	resolveStatementsForAttachments,
} from "./resolvePermissions";
import { actorLabel, type IamActor } from "./types";

const ErrLastAdmin = new AppError(
	"At least one administrator must remain.",
	409,
	"LAST_ADMIN",
);

/** The canonical "is an administrator" capability check. */
const ADMIN_PROBE_ACTION = "iam:user:update";

export interface UserIamView {
	id: string;
	firstName: string;
	lastName: string;
	campusId: string;
	isActive: boolean;
	groupIds: string[];
	directPolicyIds: string[];
	createdAt: Date;
}

function toIamView(user: IUser): UserIamView {
	return {
		id: (user.id ?? user._id).toString(),
		firstName: user.firstName,
		lastName: user.lastName,
		campusId: user.campusId?.toString() ?? "",
		isActive: user.isActive,
		groupIds: (user.groupIds ?? []).map((g) => g.toString()),
		directPolicyIds: (user.directPolicyIds ?? []).map((p) => p.toString()),
		createdAt: user.createdAt,
	};
}

export async function listUsersForIam(params: {
	search?: string;
	groupId?: string;
	campusId?: string;
	page?: number;
	pageSize?: number;
}): Promise<{ users: UserIamView[]; total: number; page: number }> {
	const page = Math.max(1, params.page ?? 1);
	const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
	const { users, total } = await listUsersDB({
		search: params.search,
		groupId: params.groupId,
		campusId: params.campusId,
		skip: (page - 1) * pageSize,
		limit: pageSize,
	});
	return { users: users.map(toIamView), total, page };
}

export async function getUserIam(id: string): Promise<UserIamView> {
	const user = await getUserByIdDB({ id });
	if (!user) throw ErrUserNotFound;
	return toIamView(user);
}

async function guardAdminInvariants({
	targetId,
	actorUserId,
	nextGroupIds,
	nextDirectPolicyIds,
}: {
	targetId: string;
	actorUserId: string;
	nextGroupIds: string[];
	nextDirectPolicyIds: string[];
}): Promise<void> {
	const adminGroup = await getGroupByNameDB({ name: ADMINISTRATORS_GROUP });
	const adminGroupId = adminGroup
		? (adminGroup.id ?? adminGroup._id).toString()
		: null;

	const current = await getUserByIdDB({ id: targetId });
	if (!current) throw ErrUserNotFound;
	const currentGroupIds = (current.groupIds ?? []).map((g) => g.toString());

	// Would the target still be an administrator after this change?
	const nextStatements = await resolveStatementsForAttachments(
		nextGroupIds,
		nextDirectPolicyIds,
	);
	const nextIsAdmin = can(nextStatements, ADMIN_PROBE_ACTION);

	// Self-lockout: you cannot strip your own admin access.
	if (targetId === actorUserId && !nextIsAdmin) throw ErrSelfLockout;

	// Last-admin: if the target is being removed from the Administrators group
	// and they are the only member, block it.
	if (adminGroupId) {
		const wasInAdminGroup = currentGroupIds.includes(adminGroupId);
		const willBeInAdminGroup = nextGroupIds.includes(adminGroupId);
		if (wasInAdminGroup && !willBeInAdminGroup) {
			const count = await countUsersInGroupDB({ groupId: adminGroupId });
			if (count <= 1) throw ErrLastAdmin;
		}
	}
}

export async function setUserGroups({
	targetId,
	groupIds,
	actor,
}: {
	targetId: string;
	groupIds: string[];
	actor: IamActor;
}): Promise<UserIamView> {
	const current = await getUserByIdDB({ id: targetId });
	if (!current) throw ErrUserNotFound;

	// Validate the groups exist.
	const found = await listGroupsDB({ ids: groupIds });
	if (found.length !== new Set(groupIds).size) throw ErrUserNotFound;

	await guardAdminInvariants({
		targetId,
		actorUserId: actor.userId,
		nextGroupIds: groupIds,
		nextDirectPolicyIds: (current.directPolicyIds ?? []).map((p) =>
			p.toString(),
		),
	});

	await setUserGroupsDB({ id: targetId, groupIds });
	await bumpPermVersion();
	await invalidateUserPermissions(targetId);
	recordAudit({
		userId: actor.userId,
		role: actorLabel(actor),
		action: "IAM_USER_SET_GROUPS",
		resourceType: "users",
		resourceId: targetId,
		previousState: { groupIds: current.groupIds },
		newState: { groupIds },
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});
	return getUserIam(targetId);
}

export async function setUserDirectPolicies({
	targetId,
	policyIds,
	actor,
}: {
	targetId: string;
	policyIds: string[];
	actor: IamActor;
}): Promise<UserIamView> {
	const current = await getUserByIdDB({ id: targetId });
	if (!current) throw ErrUserNotFound;

	const found = await listPoliciesDB({ ids: policyIds });
	if (found.length !== new Set(policyIds).size) throw ErrUserNotFound;

	await guardAdminInvariants({
		targetId,
		actorUserId: actor.userId,
		nextGroupIds: (current.groupIds ?? []).map((g) => g.toString()),
		nextDirectPolicyIds: policyIds,
	});

	await setUserDirectPoliciesDB({ id: targetId, policyIds });
	await bumpPermVersion();
	await invalidateUserPermissions(targetId);
	recordAudit({
		userId: actor.userId,
		role: actorLabel(actor),
		action: "IAM_USER_SET_POLICIES",
		resourceType: "users",
		resourceId: targetId,
		previousState: { directPolicyIds: current.directPolicyIds },
		newState: { directPolicyIds: policyIds },
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});
	return getUserIam(targetId);
}
