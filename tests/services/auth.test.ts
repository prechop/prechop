import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { hashOtp } from "@/server/constants/otp";
import { Redis } from "@/server/databases/redis";
import { UserRole } from "@/server/models/enums";
import { getUserByPhoneDB } from "@/server/models/users";
import { getVendorProfileByUserIdDB } from "@/server/models/vendorProfiles";
import { registerBuyer, registerVendor } from "@/server/services/auth/register";
import {
	otpKey,
	otpRateLimitKey,
	requestOtp,
} from "@/server/services/auth/requestOtp";
import { verifyOtpService } from "@/server/services/auth/verifyOtp";
import { connectTestDB, dropAndDisconnect, oid, uniquePhone } from "../helpers/db";

const touchedPhones = new Set<string>();

function phone(): string {
	const p = uniquePhone();
	touchedPhones.add(p);
	return p;
}

beforeAll(async () => {
	await connectTestDB();
});

afterEach(async () => {
	const keys: string[] = [];
	for (const p of touchedPhones) {
		keys.push(otpKey(p), otpRateLimitKey(p));
	}
	if (keys.length) await Redis.del(...keys);
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("requestOtp", () => {
	it("stores a hashed OTP in Redis and reports success (console SMS)", async () => {
		const p = phone();
		const res = await requestOtp(p);
		expect(res.message).toMatch(/OTP sent/i);
		const stored = await Redis.get(otpKey(p));
		expect(stored).toBeTruthy();
		// stored value is a bcrypt hash, not the raw code
		expect(stored).toMatch(/^\$2[aby]\$/);
	});

	it("rate-limits after the configured number of attempts", async () => {
		const p = phone();
		await requestOtp(p);
		await requestOtp(p);
		await requestOtp(p);
		await expect(requestOtp(p)).rejects.toThrow(); // 4th attempt
	});
});

describe("verifyOtpService", () => {
	it("verifies a correct OTP, logs the user in, and marks phone verified", async () => {
		const p = phone();
		// register creates the buyer + issues an OTP (hash we can't read),
		// so seed a known OTP hash directly to drive verification.
		await registerBuyer({
			firstName: "Ada",
			lastName: "Obi",
			phone: p,
			campusId: oid(),
		});
		await Redis.setex(otpKey(p), 600, await hashOtp("123456"));

		const result = await verifyOtpService({
			phone: p,
			otp: "123456",
			ip: "1.2.3.4",
		});
		expect(result.token.accessToken).toBeTruthy();
		expect(result.user.phone).toBe(p);
		// OTP consumed
		expect(await Redis.get(otpKey(p))).toBeNull();
		// the account is now marked verified in the DB (the returned user
		// snapshot reflects pre-update state by design)
		const persisted = await getUserByPhoneDB({ phone: p });
		expect(persisted!.isPhoneVerified).toBe(true);
	});

	it("rejects a wrong OTP", async () => {
		const p = phone();
		await Redis.setex(otpKey(p), 600, await hashOtp("111111"));
		await expect(
			verifyOtpService({ phone: p, otp: "999999", ip: "" }),
		).rejects.toThrow();
	});

	it("rejects when no OTP is stored", async () => {
		await expect(
			verifyOtpService({ phone: phone(), otp: "123456", ip: "" }),
		).rejects.toThrow();
	});
});

describe("registerBuyer / registerVendor", () => {
	it("creates a BUYER user and sends an OTP; repeat acts as login (no duplicate)", async () => {
		const p = phone();
		await registerBuyer({
			firstName: "Ada",
			lastName: "Obi",
			phone: p,
			campusId: oid(),
		});
		const user = await getUserByPhoneDB({ phone: p });
		expect(user).not.toBeNull();
		expect(user!.role).toBe(UserRole.BUYER);

		// second registration with the same phone must not create a duplicate
		await Redis.del(otpRateLimitKey(p)); // avoid the rate limit for the login path
		await registerBuyer({
			firstName: "Ada",
			lastName: "Obi",
			phone: p,
			campusId: oid(),
		});
		const again = await getUserByPhoneDB({ phone: p });
		expect(again!._id.toString()).toBe(user!._id.toString());
	});

	it("creates a VENDOR user + an INCOMPLETE vendor profile", async () => {
		const p = phone();
		await registerVendor({
			firstName: "Biz",
			lastName: "Owner",
			phone: p,
			campusId: oid(),
			email: `v-${Math.random().toString(36).slice(2)}@prechop.test`,
			businessName: "Biz Kitchen",
		});
		const user = await getUserByPhoneDB({ phone: p });
		expect(user!.role).toBe(UserRole.VENDOR);
		const profile = await getVendorProfileByUserIdDB({
			userId: user!._id.toString(),
		});
		expect(profile).not.toBeNull();
		expect(profile!.businessName).toBe("Biz Kitchen");
	});
});
