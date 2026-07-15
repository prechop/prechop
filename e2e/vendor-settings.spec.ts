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

// End-to-end coverage for the vendor settings endpoints (#7/#12): delivery
// defaults and notification preferences persist against the real server +
// seeded Mongo/Redis. Run `pnpm seed` first. Auth reuses the OTP-planting
// technique (see admin-iam.spec.ts): the code is only stored hashed, so we
// overwrite it with a known value between request and verify — test-only, no
// production code touched.

const REDIS_URI = process.env.REDIS_URI ?? "redis://127.0.0.1:6379";
const VENDOR_PHONE = "08122222222"; // seeded ACTIVE vendor "Ada's Kitchen"
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
	expect(accessToken, "access token").toBeTruthy();
	await anon.dispose();

	return request.newContext({
		baseURL: BASE_URL,
		extraHTTPHeaders: {
			origin: ORIGIN,
			authorization: `Bearer ${accessToken}`,
		},
	});
}

test.describe("Vendor settings", () => {
	test("delivery defaults persist and drive /vendors/me", async () => {
		const vendor = await login(VENDOR_PHONE);

		const save = await vendor.post("/api/vendors/me/delivery-defaults", {
			data: {
				defaultPickupAvailable: false,
				defaultDeliveryAvailable: true,
				defaultDeliveryFeeKobo: 25000,
			},
		});
		expect(save.ok(), "save delivery defaults").toBeTruthy();

		const me = await vendor.get("/api/vendors/me");
		expect(me.ok()).toBeTruthy();
		const profile = (await me.json()).data;
		expect(profile.defaultPickupAvailable).toBe(false);
		expect(profile.defaultDeliveryAvailable).toBe(true);
		expect(profile.defaultDeliveryFeeKobo).toBe(25000);

		// Restore the seeded defaults so the run is idempotent.
		await vendor.post("/api/vendors/me/delivery-defaults", {
			data: {
				defaultPickupAvailable: true,
				defaultDeliveryAvailable: false,
				defaultDeliveryFeeKobo: 0,
			},
		});
		await vendor.dispose();
	});

	test("notification preferences update only the keys sent", async () => {
		const vendor = await login(VENDOR_PHONE);

		const save = await vendor.post("/api/vendors/me/notification-prefs", {
			data: { notifyNewOrders: false },
		});
		expect(save.ok(), "save notification prefs").toBeTruthy();

		const me = await vendor.get("/api/vendors/me");
		const profile = (await me.json()).data;
		expect(profile.notifyNewOrders).toBe(false);
		// A partial update must not clobber other prefs (seeded doc may predate
		// the field, so assert it simply wasn't turned off).
		expect(profile.notifyPayouts).not.toBe(false);

		// Restore.
		await vendor.post("/api/vendors/me/notification-prefs", {
			data: { notifyNewOrders: true },
		});
		await vendor.dispose();
	});

	test("empty notification-prefs payload is rejected", async () => {
		const vendor = await login(VENDOR_PHONE);
		const res = await vendor.post("/api/vendors/me/notification-prefs", {
			data: {},
		});
		expect(res.status()).toBe(400);
		await vendor.dispose();
	});
});
