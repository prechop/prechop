import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	ADMIN_FULL_ACCESS_POLICY,
	ADMINISTRATORS_GROUP,
	BUYERS_GROUP,
	VENDORS_GROUP,
} from "@/server/constants";
import {
	getGroupByNameDB,
	getPolicyByNameDB,
	getUserByIdDB,
} from "@/server/models";
import {
	bumpPermVersion,
	can,
	createGroup,
	createPolicy,
	deleteGroup,
	deletePolicy,
	getBuiltInGroupId,
	listAllowedActions,
	matchAction,
	resolvePermissions,
	seedBuiltInIam,
	setUserDirectPolicies,
	setUserGroups,
	updateGroup,
	updatePolicy,
} from "@/server/services/iam";
import {
	clearCollections,
	connectTestDB,
	dropAndDisconnect,
} from "../helpers/db";
import { makeUser, makeUserInGroup } from "../helpers/factories";

const actor = { userId: "system", groups: ["Administrators"] };

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

beforeEach(async () => {
	await clearCollections();
	await seedBuiltInIam();
});

// ── Pure evaluator ──────────────────────────────────────────────────────────

describe("can() evaluator", () => {
	it("matchAction handles exact, prefix, and global wildcards", () => {
		expect(matchAction("*", "vendor:read")).toBe(true);
		expect(matchAction("vendor:*", "vendor:read")).toBe(true);
		expect(matchAction("iam:*", "iam:user:read")).toBe(true);
		expect(matchAction("vendor:read", "vendor:read")).toBe(true);
		expect(matchAction("vendor:read", "vendor:suspend")).toBe(false);
		expect(matchAction("vendor:*", "order:read")).toBe(false);
	});

	it("allows on match, implicit-denies with no match", () => {
		const s = [{ effect: "Allow" as const, actions: ["vendor:read"] }];
		expect(can(s, "vendor:read")).toBe(true);
		expect(can(s, "vendor:suspend")).toBe(false);
	});

	it("explicit Deny always wins over Allow", () => {
		const s = [
			{ effect: "Allow" as const, actions: ["*"] },
			{ effect: "Deny" as const, actions: ["vendor:suspend"] },
		];
		expect(can(s, "vendor:read")).toBe(true);
		expect(can(s, "vendor:suspend")).toBe(false);
	});

	it("evaluates campus-scoped conditions", () => {
		const s = [
			{
				effect: "Allow" as const,
				actions: ["order:read"],
				condition: { campusId: "$user.campusId" },
			},
		];
		const ctx = { user: { campusId: "c1" }, resource: { campusId: "c1" } };
		expect(can(s, "order:read", ctx)).toBe(true);
		expect(
			can(s, "order:read", {
				user: { campusId: "c1" },
				resource: { campusId: "c2" },
			}),
		).toBe(false);
	});

	it("listAllowedActions expands wildcards and removes denies", () => {
		const catalog = ["vendor:read", "vendor:suspend", "order:read"];
		const s = [
			{ effect: "Allow" as const, actions: ["*"] },
			{ effect: "Deny" as const, actions: ["vendor:suspend"] },
		];
		expect(listAllowedActions(s, catalog).sort()).toEqual([
			"order:read",
			"vendor:read",
		]);
	});
});

// ── Seed & resolution ────────────────────────────────────────────────────────

describe("seedBuiltInIam + resolvePermissions", () => {
	it("creates built-in policies and groups (idempotent)", async () => {
		await seedBuiltInIam(); // second run
		const admin = await getGroupByNameDB({ name: ADMINISTRATORS_GROUP });
		const policy = await getPolicyByNameDB({
			name: ADMIN_FULL_ACCESS_POLICY,
		});
		expect(admin?.isBuiltIn).toBe(true);
		expect(policy?.isBuiltIn).toBe(true);
	});

	it("resolves an administrator to full access", async () => {
		const user = await makeUserInGroup(ADMINISTRATORS_GROUP);
		const resolved = await resolvePermissions(user!._id.toString());
		expect(resolved.groups).toContain(ADMINISTRATORS_GROUP);
		expect(can(resolved.statements, "iam:policy:manage")).toBe(true);
		expect(can(resolved.statements, "vendor:suspend")).toBe(true);
	});

	it("resolves a buyer to buyer-only capabilities", async () => {
		const user = await makeUserInGroup(BUYERS_GROUP);
		const resolved = await resolvePermissions(user!._id.toString());
		expect(can(resolved.statements, "buyer:order:create")).toBe(true);
		expect(can(resolved.statements, "vendor:suspend")).toBe(false);
	});

	it("returns empty for an unknown user", async () => {
		const resolved = await resolvePermissions("507f1f77bcf86cd799439011");
		expect(resolved.statements).toEqual([]);
	});

	it("reflects attachment changes after a permVersion bump", async () => {
		const user = await makeUser();
		const id = user!._id.toString();
		let resolved = await resolvePermissions(id);
		expect(can(resolved.statements, "buyer:order:read")).toBe(false);

		const buyers = await getBuiltInGroupId(BUYERS_GROUP);
		await setUserGroups({ targetId: id, groupIds: [buyers!], actor });
		resolved = await resolvePermissions(id);
		expect(can(resolved.statements, "buyer:order:read")).toBe(true);
	});
});

// ── Policy CRUD ──────────────────────────────────────────────────────────────

describe("policy service", () => {
	it("creates a custom policy with validated actions", async () => {
		const p = await createPolicy({
			name: "CustomReadOnly",
			statements: [{ effect: "Allow", actions: ["vendor:read"] }],
			actor,
		});
		expect(p.isBuiltIn).toBe(false);
	});

	it("rejects unknown actions", async () => {
		await expect(
			createPolicy({
				name: "Bad",
				statements: [
					{ effect: "Allow", actions: ["not:a:real:action"] },
				],
				actor,
			}),
		).rejects.toThrow();
	});

	it("refuses to edit or delete a built-in policy", async () => {
		const builtin = await getPolicyByNameDB({
			name: ADMIN_FULL_ACCESS_POLICY,
		});
		const id = (builtin!.id ?? builtin!._id).toString();
		await expect(
			updatePolicy({ id, description: "x", actor }),
		).rejects.toThrow();
		await expect(deletePolicy({ id, actor })).rejects.toThrow();
	});

	it("detaches a deleted policy from groups", async () => {
		const p = await createPolicy({
			name: "Temp",
			statements: [{ effect: "Allow", actions: ["vendor:read"] }],
			actor,
		});
		const g = await createGroup({
			name: "TempGroup",
			policyIds: [p.id ?? p._id],
			actor,
		});
		await deletePolicy({ id: (p.id ?? p._id).toString(), actor });
		const after = await getGroupByNameDB({ name: "TempGroup" });
		expect(after?.policyIds ?? []).toHaveLength(0);
		expect(g.name).toBe("TempGroup");
	});
});

// ── Group CRUD ───────────────────────────────────────────────────────────────

describe("group service", () => {
	it("creates and updates a custom group", async () => {
		const g = await createGroup({ name: "Reviewers", actor });
		const updated = await updateGroup({
			id: (g.id ?? g._id).toString(),
			description: "Content reviewers",
			actor,
		});
		expect(updated.description).toBe("Content reviewers");
	});

	it("refuses to modify or delete a built-in group", async () => {
		const admin = await getGroupByNameDB({ name: ADMINISTRATORS_GROUP });
		const id = (admin!.id ?? admin!._id).toString();
		await expect(
			updateGroup({ id, description: "x", actor }),
		).rejects.toThrow();
		await expect(deleteGroup({ id, actor })).rejects.toThrow();
	});

	it("deletes a custom group and detaches it from members", async () => {
		const g = await createGroup({ name: "Temp", actor });
		const gid = (g.id ?? g._id).toString();
		const user = await makeUser();
		await setUserGroups({
			targetId: user!._id.toString(),
			groupIds: [gid],
			actor,
		});
		await deleteGroup({ id: gid, actor });
		expect(await getGroupByNameDB({ name: "Temp" })).toBeNull();
		const fresh = await getUserByIdDB({ id: user!._id.toString() });
		expect(fresh!.groupIds.map((x) => x.toString())).not.toContain(gid);
	});
});

// ── User attachment guards ───────────────────────────────────────────────────

describe("user IAM guards", () => {
	it("prevents removing the last administrator", async () => {
		const admin = await makeUserInGroup(ADMINISTRATORS_GROUP);
		const buyers = await getBuiltInGroupId(BUYERS_GROUP);
		await expect(
			setUserGroups({
				targetId: admin!._id.toString(),
				groupIds: [buyers!],
				actor: { userId: "someone-else" },
			}),
		).rejects.toThrow();
	});

	it("prevents an admin from stripping their own access (self-lockout)", async () => {
		const a1 = await makeUserInGroup(ADMINISTRATORS_GROUP);
		const a2 = await makeUserInGroup(ADMINISTRATORS_GROUP); // keep ≥1 admin
		const buyers = await getBuiltInGroupId(BUYERS_GROUP);
		await expect(
			setUserGroups({
				targetId: a1!._id.toString(),
				groupIds: [buyers!],
				actor: { userId: a1!._id.toString() },
			}),
		).rejects.toThrow();
		expect(a2).not.toBeNull();
	});

	it("allows attaching a direct policy", async () => {
		const user = await makeUser();
		const p = await createPolicy({
			name: "DirectGrant",
			statements: [{ effect: "Allow", actions: ["audit:read"] }],
			actor,
		});
		await setUserDirectPolicies({
			targetId: user!._id.toString(),
			policyIds: [(p.id ?? p._id).toString()],
			actor,
		});
		const resolved = await resolvePermissions(user!._id.toString());
		expect(can(resolved.statements, "audit:read")).toBe(true);
		const fresh = await getUserByIdDB({ id: user!._id.toString() });
		expect(fresh!.directPolicyIds).toHaveLength(1);
	});

	it("bumpPermVersion increments monotonically", async () => {
		const v1 = await bumpPermVersion();
		const v2 = await bumpPermVersion();
		expect(v2).toBeGreaterThan(v1);
	});
});
