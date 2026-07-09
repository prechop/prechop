import {
	type APIRequestContext,
	expect,
	request,
	test,
} from "@playwright/test";
import { hash as bcryptHash } from "bcrypt";
import IoRedis from "ioredis";
import mongoose from "mongoose";

// End-to-end coverage for the IAM permission system and the vendor onboarding
// approval gate, driven against the real server + seeded local Mongo/Redis.
// Run `pnpm seed` first. Auth is completed by planting a known OTP hash into
// Redis between the request and verify steps (the code is only stored hashed,
// so a pure black-box login is not possible) — a test-only technique that
// touches no production code.

const REDIS_URI = process.env.REDIS_URI ?? "redis://127.0.0.1:6379";
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
const DB_NAME = process.env.DB_NAME ?? "prechop";
const ORIGIN = "http://localhost:3100";

const ADMIN_PHONE = process.env.SEED_ADMIN_PHONE ?? "08130135756";
const BUYER_PHONE = "08111111111";
const KNOWN_OTP = "123456";

let redis: IoRedis;
let mongo: mongoose.mongo.MongoClient;

test.beforeAll(async () => {
	redis = new IoRedis(REDIS_URI, { maxRetriesPerRequest: 3 });
	mongo = new mongoose.mongo.MongoClient(MONGODB_URI);
	await mongo.connect();
	// Guarantee the onboarding queue has a pending vendor every run.
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
	await redis?.quit();
	await mongo?.close();
});

/**
 * Complete OTP login for a seeded phone and return a context that carries the
 * access token as a Bearer header — the server accepts either the auth cookie
 * or `Authorization: Bearer`, and the cookie is `secure` under `next start`
 * (production) so it won't travel over plain HTTP in tests.
 */
async function login(phone: string): Promise<APIRequestContext> {
	const anon = await request.newContext({
		baseURL: "http://127.0.0.1:3100",
		extraHTTPHeaders: { origin: ORIGIN },
	});
	// Clear any prior OTP rate-limit so the suite is re-runnable.
	await redis.del(`otp:ratelimit:${phone}`);
	const req = await anon.post("/api/auth/otp/request", { data: { phone } });
	expect(req.ok(), "otp request").toBeTruthy();
	// Overwrite the server-generated hash with a known one.
	await redis.setex(
		`otp:code:${phone}`,
		600,
		await bcryptHash(KNOWN_OTP, 10),
	);
	const verify = await anon.post("/api/auth/otp/verify", {
		data: { phone, otp: KNOWN_OTP },
	});
	expect(verify.ok(), "otp verify").toBeTruthy();
	const accessToken = (await verify.json()).data.accessToken as string;
	expect(accessToken, "access token").toBeTruthy();
	await anon.dispose();

	return request.newContext({
		baseURL: "http://127.0.0.1:3100",
		extraHTTPHeaders: {
			origin: ORIGIN,
			authorization: `Bearer ${accessToken}`,
		},
	});
}

test.describe("IAM — administrator", () => {
	test("admin resolves full permissions and can read IAM resources", async () => {
		const admin = await login(ADMIN_PHONE);

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
		const admin = await login(ADMIN_PHONE);
		const policies = (
			await (await admin.get("/api/admin/iam/policies")).json()
		).data as Array<{ id: string; name: string }>;
		const builtin = policies.find(
			(p) => p.name === "AdministratorFullAccess",
		);
		expect(builtin).toBeTruthy();
		const res = await admin.delete(
			`/api/admin/iam/policies/${builtin!.id}`,
		);
		expect(res.status()).toBe(403);
		await admin.dispose();
	});
});

test.describe("Vendor onboarding gate", () => {
	test("admin sees the queue, approves a vendor, and it goes ACTIVE", async () => {
		const admin = await login(ADMIN_PHONE);

		const queue = (await (await admin.get("/api/admin/onboarding")).json())
			.data as Array<{ id: string; businessName: string }>;
		const target = queue.find((v) => v.businessName === "Campus Bites");
		expect(target, "Campus Bites must be in the review queue").toBeTruthy();

		const approve = await admin.post(
			`/api/admin/onboarding/${target!.id}/approve`,
			{ data: {} },
		);
		expect(approve.status()).toBe(200);

		// Persisted: it leaves the queue and shows as ACTIVE.
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

test.describe("IAM — least privilege", () => {
	test("a buyer is denied admin endpoints but keeps buyer capabilities", async () => {
		const buyer = await login(BUYER_PHONE);

		const me = await (await buyer.get("/api/users/me")).json();
		expect(me.data.groups).toContain("Buyers");
		expect(me.data.permissions).not.toContain("iam:user:read");

		// Denied the admin console (regression guard for privilege escalation).
		expect((await buyer.get("/api/admin/onboarding")).status()).toBe(403);
		expect((await buyer.get("/api/admin/iam/users")).status()).toBe(403);

		// Buyer capability still works (regression guard for the 403-on-order bug).
		expect((await buyer.get("/api/orders")).status()).toBe(200);
		await buyer.dispose();
	});
});
