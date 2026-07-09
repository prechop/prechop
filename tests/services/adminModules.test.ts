import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	createPaymentDB,
	getMenuItemByIdDB,
	listNotificationsDB,
} from "@/server/models";
import {
	broadcastNotification,
	listAdminPayments,
	listCatalog,
	setCatalogItemAvailability,
} from "@/server/services/admin";
import {
	createPolicy,
	getGroup,
	getPolicy,
	getUserIam,
	listGroups,
	listPolicies,
	listUsersForIam,
	seedBuiltInIam,
	updatePolicy,
} from "@/server/services/iam";
import {
	clearCollections,
	connectTestDB,
	dropAndDisconnect,
	oid,
} from "../helpers/db";
import { makeMenuItem, makeUser, makeVendor } from "../helpers/factories";

const actor = { userId: oid(), role: "Administrators" };

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

describe("admin catalog", () => {
	it("lists menu items across vendors and filters by search", async () => {
		const { vendorId, campusId } = await makeVendor();
		await makeMenuItem({ vendorId, campusId, name: "Jollof Rice" });
		await makeMenuItem({ vendorId, campusId, name: "Meat Pie" });

		const all = await listCatalog({});
		expect(all.total).toBe(2);

		const filtered = await listCatalog({ search: "Jollof" });
		expect(filtered.total).toBe(1);
		expect(filtered.items[0]?.name).toBe("Jollof Rice");
	});

	it("takes down and restores an item, with audit", async () => {
		const { vendorId, campusId } = await makeVendor();
		const item = await makeMenuItem({ vendorId, campusId });
		const id = item!._id.toString();

		await setCatalogItemAvailability({ id, isAvailable: false, actor });
		expect((await getMenuItemByIdDB({ id }))!.isAvailable).toBe(false);

		await setCatalogItemAvailability({ id, isAvailable: true, actor });
		expect((await getMenuItemByIdDB({ id }))!.isAvailable).toBe(true);
	});

	it("rejects an unknown item", async () => {
		await expect(
			setCatalogItemAvailability({
				id: oid(),
				isAvailable: false,
				actor,
			}),
		).rejects.toThrow();
	});
});

describe("admin payments", () => {
	it("lists payments newest-first with a status filter", async () => {
		const base = {
			buyerId: oid(),
			vendorId: oid(),
			platformFeeKobo: 100,
			vendorAmountKobo: 900,
		};
		await createPaymentDB({
			payload: {
				...base,
				buyerOrderId: oid(),
				paystackRef: "ref_success",
				amountKobo: 1000,
				idempotencyKey: "k1",
			},
		});
		await createPaymentDB({
			payload: {
				...base,
				buyerOrderId: oid(),
				paystackRef: "ref_two",
				amountKobo: 2000,
				idempotencyKey: "k2",
			},
		});

		const all = await listAdminPayments({});
		expect(all.total).toBe(2);
		expect(all.payments.length).toBe(2);

		const initialized = await listAdminPayments({ status: "INITIALIZED" });
		expect(initialized.total).toBe(2); // default status is INITIALIZED
	});
});

describe("admin notifications broadcast", () => {
	it("delivers an in-app notification to every targeted user", async () => {
		const u1 = await makeUser();
		const u2 = await makeUser();
		const res = await broadcastNotification({
			title: "Hello",
			body: "Free delivery today!",
			actor,
		});
		expect(res.recipients).toBe(2);

		const n1 = await listNotificationsDB({ userId: u1!._id.toString() });
		const n2 = await listNotificationsDB({ userId: u2!._id.toString() });
		expect(n1.length).toBe(1);
		expect(n2.length).toBe(1);
		expect(n1[0]?.title).toBe("Hello");
	});
});

describe("iam read paths", () => {
	it("lists groups with their resolved policies", async () => {
		const groups = await listGroups();
		const admin = groups.find((g) => g.name === "Administrators");
		expect(admin).toBeTruthy();
		expect(admin!.policies.map((p) => p.name)).toContain(
			"AdministratorFullAccess",
		);
	});

	it("gets a group and a policy by id", async () => {
		const groups = await listGroups();
		const gid = (groups[0].id ?? groups[0]._id).toString();
		expect((await getGroup(gid)).name).toBeTruthy();

		const policies = await listPolicies();
		const pid = (policies[0].id ?? policies[0]._id).toString();
		expect((await getPolicy(pid)).name).toBeTruthy();
	});

	it("updates a custom policy's statements", async () => {
		const p = await createPolicy({
			name: "Editable",
			statements: [{ effect: "Allow", actions: ["vendor:read"] }],
			actor,
		});
		const updated = await updatePolicy({
			id: (p.id ?? p._id).toString(),
			statements: [
				{ effect: "Allow", actions: ["vendor:read", "order:read"] },
			],
			actor,
		});
		expect(updated.statements[0].actions).toContain("order:read");
	});

	it("lists and gets users for the IAM screen", async () => {
		const u = await makeUser();
		const page = await listUsersForIam({ pageSize: 10 });
		expect(page.total).toBeGreaterThanOrEqual(1);

		const view = await getUserIam(u!._id.toString());
		expect(view.id).toBe(u!._id.toString());
		expect(Array.isArray(view.groupIds)).toBe(true);
	});
});
