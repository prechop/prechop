import {
	type APIRequestContext,
	expect,
	request,
	test,
} from "@playwright/test";
import { hash as bcryptHash } from "bcrypt";
import IoRedis from "ioredis";
import { clearOtpGates, otpCodeKey } from "./otpKeys";
import { BASE_URL, ORIGIN } from "./urls";

// End-to-end coverage for reusable menu option groups, driven against the real
// server + seeded local Mongo/Redis. Run `pnpm seed` first. Auth reuses the
// planted-OTP-hash technique (the code is only stored hashed) — test-only.

const REDIS_URI = process.env.REDIS_URI ?? "redis://127.0.0.1:6379";
const VENDOR_PHONE = "08122222222";
const KNOWN_OTP = "123456";

let redis: IoRedis;

test.beforeAll(async () => {
	redis = new IoRedis(REDIS_URI, { maxRetriesPerRequest: 3 });
});

test.afterAll(async () => {
	await redis?.quit();
});

async function login(phone: string): Promise<APIRequestContext> {
	const anon = await request.newContext({
		baseURL: BASE_URL,
		extraHTTPHeaders: { origin: ORIGIN },
	});
	await clearOtpGates(redis, phone);
	const req = await anon.post("/api/auth/otp/request", { data: { phone } });
	expect(req.ok(), "otp request").toBeTruthy();
	await redis.setex(otpCodeKey(phone), 600, await bcryptHash(KNOWN_OTP, 10));
	const verify = await anon.post("/api/auth/otp/verify", {
		data: { phone, otp: KNOWN_OTP },
	});
	expect(verify.ok(), "otp verify").toBeTruthy();
	const accessToken = (await verify.json()).data.accessToken as string;
	await anon.dispose();
	return request.newContext({
		baseURL: BASE_URL,
		extraHTTPHeaders: {
			origin: ORIGIN,
			authorization: `Bearer ${accessToken}`,
		},
	});
}

test.describe("menu option groups", () => {
	test("vendor creates a group, attaches it to a menu item, and it round-trips", async () => {
		const vendor = await login(VENDOR_PHONE);

		// 1. Create a reusable option group.
		const create = await vendor.post("/api/menu/option-groups", {
			data: {
				name: `Protein ${Date.now()}`,
				required: true,
				minSelect: 1,
				maxSelect: 1,
				options: [
					{ name: "Chicken", priceNaira: 500 },
					{ name: "Beef", priceNaira: 600 },
				],
			},
		});
		expect(create.status(), await create.text()).toBe(201);
		const created = (await create.json()).data;
		expect(created.options).toHaveLength(2);
		// Naira → kobo conversion is server-side.
		expect(created.options[0].priceKobo).toBe(50000);
		const groupId = String(created._id);

		// 2. It appears in the vendor's library (aggregate exposes `id`).
		const list = await vendor.get("/api/menu/option-groups");
		expect(list.ok()).toBeTruthy();
		const groups = (await list.json()).data as Array<{ id: string }>;
		expect(groups.some((g) => g.id === groupId)).toBeTruthy();

		// 3. Create a menu item with the group attached.
		const item = await vendor.post("/api/menu", {
			data: {
				name: `Special ${Date.now()}`,
				category: "MEALS",
				priceNaira: 1500,
				optionGroupIds: [groupId],
			},
		});
		expect(item.status(), await item.text()).toBe(201);
		const itemId = String((await item.json()).data._id);

		// 4. The menu listing carries the attached group id.
		const menu = await vendor.get("/api/menu");
		const menuItems = (await menu.json()).data as Array<{
			id: string;
			optionGroupIds: string[];
		}>;
		const found = menuItems.find((m) => m.id === itemId);
		expect(found?.optionGroupIds).toContain(groupId);

		// 5. Cleanup: detach + delete the item and group we created.
		await vendor.patch(`/api/menu/${itemId}`, {
			data: { optionGroupIds: [] },
		});
		await vendor.delete(`/api/menu/${itemId}`);
		await vendor.delete(`/api/menu/option-groups/${groupId}`);
		await vendor.dispose();
	});

	test("rejects an invalid option group (required with no minimum)", async () => {
		const vendor = await login(VENDOR_PHONE);
		const res = await vendor.post("/api/menu/option-groups", {
			data: {
				name: "Bad group",
				required: true,
				minSelect: 0,
				options: [{ name: "X", priceNaira: 0 }],
			},
		});
		expect(res.status()).toBe(400);
		await vendor.dispose();
	});

	test("rejects attaching an option group the vendor does not own", async () => {
		const vendor = await login(VENDOR_PHONE);
		const res = await vendor.post("/api/menu", {
			data: {
				name: `Ghost ${Date.now()}`,
				category: "MEALS",
				priceNaira: 1000,
				// A syntactically valid but non-existent group id.
				optionGroupIds: ["ffffffffffffffffffffffff"],
			},
		});
		expect(res.status()).toBe(400);
		await vendor.dispose();
	});
});
