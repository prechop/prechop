// Two display/identity services that had ~0% coverage:
//   - getEffectiveFeePolicy: the ONLY honest "what will I be charged" source,
//     resolved through the same guard placeOrder charges with.
//   - changePhone: OTP-gated phone change, uniqueness-guarded both ways.
//
// Real Mongo + real Redis (the OTP store). Nothing under test is mocked.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashOtp } from "@/server/constants";
import { Redis } from "@/server/databases";
import { createUserDB, getUserByPhoneDB } from "@/server/models";
import { otpKey, otpRateLimitKey } from "@/server/services/auth/requestOtp";
import {
	getEffectiveFeePolicy,
	toEffectiveFeePolicy,
} from "@/server/services/siteConfigs/getEffectiveFeePolicy";
import {
	confirmPhoneChange,
	requestPhoneChangeOtp,
} from "@/server/services/users/changePhone";
import { connectTestDB, dropAndDisconnect, uniquePhone } from "../helpers/db";
import { makeUser, seedTestIam } from "../helpers/factories";

const otpKeysTouched = new Set<string>();

/**
 * A fresh, valid E.164 phone per call. Redis is SHARED across runs, and
 * `requestOtp` writes a per-phone rate-limit counter — a fixed number would
 * accumulate attempts across runs and eventually trip the limiter. Both the OTP
 * code key and the rate-limit key are tracked for teardown.
 */
function freshPhone(): string {
	const local = uniquePhone(); // 0801xxxxxxx
	const e164 = `+234${local.slice(1)}`;
	otpKeysTouched.add(otpKey(e164));
	otpKeysTouched.add(otpRateLimitKey(e164));
	return e164;
}

beforeAll(async () => {
	await connectTestDB();
	await seedTestIam();
});

afterAll(async () => {
	// Redis lives outside the scratch Mongo — clean our OTP keys explicitly.
	if (otpKeysTouched.size) await Redis.del(...otpKeysTouched);
	await dropAndDisconnect();
});

describe("getEffectiveFeePolicy / toEffectiveFeePolicy", () => {
	it("falls back to the env default policy when no config is set", async () => {
		// tests/setup.ts pins the env fees: buyer 3% (cap ₦200 = 20000 kobo), vendor 8%.
		const policy = await getEffectiveFeePolicy();
		expect(policy).toEqual({
			platformFeeBuyerPercent: 3,
			platformFeeBuyerMaxKobo: 20000,
			platformFeeVendorPercent: 8,
		});
	});

	it("maps an admin-set siteConfigs doc to the wire shape", () => {
		const policy = toEffectiveFeePolicy({
			platformFeeBuyerPercent: 5,
			platformFeeBuyerMaxKobo: 50000,
			platformFeeVendorPercent: 12,
		});
		expect(policy).toEqual({
			platformFeeBuyerPercent: 5,
			platformFeeBuyerMaxKobo: 50000,
			platformFeeVendorPercent: 12,
		});
	});

	it("honours an explicit admin-set 0% fee (not treated as 'unset')", () => {
		const policy = toEffectiveFeePolicy({
			platformFeeBuyerPercent: 0,
			platformFeeBuyerMaxKobo: 0,
			platformFeeVendorPercent: 0,
		});
		expect(policy.platformFeeBuyerPercent).toBe(0);
		expect(policy.platformFeeVendorPercent).toBe(0);
	});

	it("falls back loudly on a garbage (present-but-invalid) fee value", () => {
		// A misconfigured string must NOT become NaN or 0 on the money path.
		const policy = toEffectiveFeePolicy({
			platformFeeBuyerPercent: "8%" as unknown,
			platformFeeVendorPercent: -5 as unknown,
		});
		expect(policy.platformFeeBuyerPercent).toBe(3); // env fallback
		expect(policy.platformFeeVendorPercent).toBe(8); // env fallback
	});
});

describe("changePhone", () => {
	it("requestPhoneChangeOtp issues an OTP for an available number", async () => {
		const user = await makeUser();
		const newPhone = freshPhone();

		const res = await requestPhoneChangeOtp({
			userId: user!._id.toString(),
			phone: newPhone,
		});
		expect(res.message).toMatch(/otp/i);
	});

	it("rejects requesting a change to a number already in use by someone else", async () => {
		const takenPhone = uniquePhone(); // 0801xxxxxxx, unique per run
		otpKeysTouched.add(otpRateLimitKey(`+234${takenPhone.slice(1)}`));
		// A user who already owns that number.
		await createUserDB({
			payload: {
				campusId: (await makeUser())!.campusId.toString(),
				firstName: "Owns",
				lastName: "Number",
				phone: takenPhone,
				groupIds: [],
				isPhoneVerified: true,
			},
		});
		const mover = await makeUser();
		await expect(
			requestPhoneChangeOtp({
				userId: mover!._id.toString(),
				phone: takenPhone,
			}),
		).rejects.toThrow(/already in use/i);
	});

	it("confirmPhoneChange verifies the OTP and updates the phone", async () => {
		const user = await makeUser();
		const userId = user!._id.toString();
		const newPhone = freshPhone();
		const key = otpKey(newPhone);
		await Redis.setex(key, 600, await hashOtp("123456"));

		const publicUser = await confirmPhoneChange({
			userId,
			phone: newPhone,
			otp: "123456",
		});
		expect(publicUser.id).toBe(userId);

		// The number really moved, and the OTP was consumed.
		const moved = await getUserByPhoneDB({ phone: newPhone });
		expect(moved?._id.toString()).toBe(userId);
		expect(await Redis.get(key)).toBeNull();
	});

	it("rejects a wrong OTP and leaves the phone unchanged", async () => {
		const user = await makeUser();
		const userId = user!._id.toString();
		const newPhone = freshPhone();
		const key = otpKey(newPhone);
		await Redis.setex(key, 600, await hashOtp("123456"));

		await expect(
			confirmPhoneChange({ userId, phone: newPhone, otp: "000000" }),
		).rejects.toThrow();
		// Number NOT taken by this user.
		const still = await getUserByPhoneDB({ phone: newPhone });
		expect(still).toBeNull();
	});

	it("rejects when no OTP was ever issued for the number", async () => {
		const user = await makeUser();
		await expect(
			confirmPhoneChange({
				userId: user!._id.toString(),
				phone: freshPhone(),
				otp: "123456",
			}),
		).rejects.toThrow();
	});
});
