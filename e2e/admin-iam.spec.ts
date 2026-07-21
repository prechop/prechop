import {
	type APIRequestContext,
	expect,
	request,
	test,
} from "@playwright/test";
import mongoose from "mongoose";
import { ADMIN_EMAIL, authenticatedRequest, BUYER_EMAIL } from "./auth";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";

let mongo: mongoose.mongo.MongoClient;

test.beforeAll(async () => {
	mongo = new mongoose.mongo.MongoClient(MONGODB_URI);
	await mongo.connect();
	await mongo
		.db(DB_NAME)
		.collection("vendorprofiles")
		.updateOne(
			{ email: "chidi@campusbites.ng" },
			{
				$set: {
					status: "PENDING_REVIEW",
					submittedAt: new Date(),
					rejectionReason: null,
				},
			},
		);
});

test.afterAll(async () => {
	await mongo?.close();
});

async function login(email: string): Promise<APIRequestContext> {
	return authenticatedRequest(request, email);
}

test.describe("IAM - administrator", () => {
	test("admin resolves full permissions and can read IAM resources", async () => {
		const admin = await login(ADMIN_EMAIL);

		const me = await (await admin.get("/api/users/me")).json();
		expect(me.data.groups).toContain("Administrators");
		expect(me.data.permissions).toContain("iam:user:read");
		expect(me.data.permissions).toContain("vendor:suspend");

		for (const path of [
			"/api/admin/iam/users",
			"/api/admin/iam/groups",
			"/api/admin/iam/policies",
			"/api/admin/iam/catalog",
		]) {
			const res = await admin.get(path);
			expect(res.status(), path).toBe(200);
		}

		const groups = (await (await admin.get("/api/admin/iam/groups")).json())
			.data as Array<{ name: string; isBuiltIn: boolean }>;
		expect(groups.map((g) => g.name)).toContain("Administrators");
		expect(groups.find((g) => g.name === "Administrators")?.isBuiltIn).toBe(
			true,
		);
		await admin.dispose();
	});

	test("built-in policy cannot be deleted", async () => {
		const admin = await login(ADMIN_EMAIL);
		const policies = (
			await (await admin.get("/api/admin/iam/policies")).json()
		).data as Array<{ id: string; name: string }>;
		const builtin = policies.find(
			(p) => p.name === "AdministratorFullAccess",
		);
		if (!builtin) throw new Error("AdministratorFullAccess policy missing");
		const res = await admin.delete(`/api/admin/iam/policies/${builtin.id}`);
		expect(res.status()).toBe(403);
		await admin.dispose();
	});
});

test.describe("Vendor onboarding gate", () => {
	test("admin sees the queue, approves a vendor, and it goes ACTIVE", async () => {
		const admin = await login(ADMIN_EMAIL);

		const queue = (await (await admin.get("/api/admin/onboarding")).json())
			.data as Array<{ id: string; businessName: string }>;
		const target = queue.find((v) => v.businessName === "Campus Bites");
		if (!target)
			throw new Error("Campus Bites must be in the review queue");

		const approve = await admin.post(
			`/api/admin/onboarding/${target.id}/approve`,
			{ data: {} },
		);
		expect(approve.status()).toBe(200);

		const after = (await (await admin.get("/api/admin/onboarding")).json())
			.data as Array<{ businessName: string }>;
		expect(
			after.find((v) => v.businessName === "Campus Bites"),
		).toBeFalsy();

		const doc = await mongo
			.db(DB_NAME)
			.collection("vendorprofiles")
			.findOne({ email: "chidi@campusbites.ng" });
		expect(doc?.status).toBe("ACTIVE");
		await admin.dispose();
	});
});

test.describe("IAM - least privilege", () => {
	test("a buyer is denied admin endpoints but keeps buyer capabilities", async () => {
		const buyer = await login(BUYER_EMAIL);

		const me = await (await buyer.get("/api/users/me")).json();
		expect(me.data.groups).toContain("Buyers");
		expect(me.data.permissions).not.toContain("iam:user:read");

		expect((await buyer.get("/api/admin/onboarding")).status()).toBe(403);
		expect((await buyer.get("/api/admin/iam/users")).status()).toBe(403);
		expect((await buyer.get("/api/orders")).status()).toBe(200);
		await buyer.dispose();
	});
});
