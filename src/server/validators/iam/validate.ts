import { z as zod } from "zod";

const statementSchema = zod
	.object({
		effect: zod.enum(["Allow", "Deny"]),
		actions: zod.array(zod.string().trim().min(1)).min(1),
		resources: zod.array(zod.string().trim().min(1)).optional(),
		condition: zod.record(zod.string(), zod.string()).optional(),
	})
	.strict();

export const createPolicySchema = zod
	.object({
		name: zod.string().trim().min(1).max(120),
		description: zod.string().trim().max(500).optional(),
		statements: zod.array(statementSchema).min(1),
	})
	.strict();

export const updatePolicySchema = zod
	.object({
		description: zod.string().trim().max(500).optional(),
		statements: zod.array(statementSchema).min(1).optional(),
	})
	.strict();

export const createGroupSchema = zod
	.object({
		name: zod.string().trim().min(1).max(120),
		description: zod.string().trim().max(500).optional(),
		policyIds: zod.array(zod.string().trim().min(1)).optional(),
	})
	.strict();

export const updateGroupSchema = zod
	.object({
		description: zod.string().trim().max(500).optional(),
		policyIds: zod.array(zod.string().trim().min(1)).optional(),
	})
	.strict();

export const setUserGroupsSchema = zod
	.object({ groupIds: zod.array(zod.string().trim().min(1)) })
	.strict();

export const setUserPoliciesSchema = zod
	.object({ policyIds: zod.array(zod.string().trim().min(1)) })
	.strict();

export const usersQuerySchema = zod
	.object({
		search: zod.string().trim().max(120).optional(),
		groupId: zod.string().trim().min(1).optional(),
		campusId: zod.string().trim().min(1).optional(),
		page: zod.coerce.number().int().min(1).optional(),
		pageSize: zod.coerce.number().int().min(1).max(100).optional(),
	})
	.strict();
