import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
	BUYERS_GROUP,
	normalizeNigerianMobilePhone,
	VENDORS_GROUP,
} from "@/server/constants";
import { hashOtp } from "@/server/constants/otp";
import { Redis } from "@/server/databases/redis";
import { LocationType, VendorType } from "@/server/models";
import { createCampusDB } from "@/server/models/campuses";
import { getUserByPhoneDB } from "@/server/models/users";
import {
	createVendorProfileDB,
	getVendorProfileByUserIdDB,
} from "@/server/models/vendorProfiles";
import {
	autoProvisionBuyer,
	registerBuyer,
	registerVendor,
} from "@/server/services/auth/register";
import {
	otpKey,
	otpRateLimitKey,
	requestOtp,
} from "@/server/services/auth/requestOtp";
import { verifyOtpService } from "@/server/services/auth/verifyOtp";
import { getBuiltInGroupId, seedBuiltInIam } from "@/server/services/iam";
import { becomeVendor } from "@/server/services/users";
import {
	connectTestDB,
	dropAndDisconnect,
	oid,
	uniquePhone,
} from "../helpers/db";

const touchedPhones = new Set<string>();

function phone(): string {
	const p = uniquePhone();
	touchedPhones.add(p);
	return p;
}

function must<T>(value: T | null | undefined): T {
	expect(value).toBeTruthy();
	if (!value) throw new Error("Expected test value to exist.");
	return value;
}

function normalized(phone: string): string {
	const value = normalizeNigerianMobilePhone(phone);
	if (!value) throw new Error(`Invalid test phone: ${phone}`);
	return value;
}

beforeAll(async () => {
	await connectTestDB();
	await seedBuiltInIam();
});

afterEach(async () => {
	const keys: string[] = [];
	for (const p of touchedPhones) {
		const n = normalized(p);
		keys.push(otpKey(p), otpRateLimitKey(p), otpKey(n), otpRateLimitKey(n));
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
		const stored = await Redis.get(otpKey(normalized(p)));
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
		await Redis.setex(otpKey(normalized(p)), 600, await hashOtp("123456"));

		const result = await verifyOtpService({
			phone: p,
			otp: "123456",
			ip: "1.2.3.4",
		});
		expect(result.token.accessToken).toBeTruthy();
		expect(result.user.phone).toBe(normalized(p));
		// OTP consumed
		expect(await Redis.get(otpKey(normalized(p)))).toBeNull();
		// the account is now marked verified in the DB (the returned user
		// snapshot reflects pre-update state by design)
		const persisted = await getUserByPhoneDB({ phone: p });
		expect(must(persisted).isPhoneVerified).toBe(true);
	});

	it("auto-provisions a buyer for a first-time phone (unified login)", async () => {
		// Auto-provisioning assigns the first active campus, so one must exist.
		await createCampusDB({
			payload: {
				name: "Auto Campus",
				shortCode: `AUTO${Math.floor(Math.random() * 100000)}`,
				state: "Lagos",
			},
		});
		const p = phone();
		// No prior registration — the phone verifies straight through.
		await Redis.setex(otpKey(normalized(p)), 600, await hashOtp("123456"));

		const result = await verifyOtpService({
			phone: p,
			otp: "123456",
			ip: "9.9.9.9",
		});
		expect(result.token.accessToken).toBeTruthy();
		// A Buyers-group account now exists for that phone.
		const created = await getUserByPhoneDB({ phone: p });
		expect(created).not.toBeNull();
		const buyersGroupId = await getBuiltInGroupId(BUYERS_GROUP);
		expect(must(created).groupIds.map((g) => g.toString())).toContain(
			buyersGroupId,
		);
		expect(result.user.groups).toContain("Buyers");
	});

	it("auto-provision helper is idempotent by phone (no duplicate account)", async () => {
		await createCampusDB({
			payload: {
				name: "Auto Campus 2",
				shortCode: `AUT2${Math.floor(Math.random() * 100000)}`,
				state: "Lagos",
			},
		});
		const p = phone();
		const first = await autoProvisionBuyer(p);
		expect(first).not.toBeNull();
		// A second verify for the same phone must reuse the account, not duplicate.
		await Redis.setex(otpKey(normalized(p)), 600, await hashOtp("123456"));
		const result = await verifyOtpService({
			phone: p,
			otp: "123456",
			ip: "9.9.9.9",
		});
		expect(result.user.id).toBe(must(first)._id.toString());
	});

	it("rejects a wrong OTP", async () => {
		const p = phone();
		await Redis.setex(otpKey(normalized(p)), 600, await hashOtp("111111"));
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
		const buyersGroupId = await getBuiltInGroupId(BUYERS_GROUP);
		expect(must(user).groupIds.map((g) => g.toString())).toContain(
			buyersGroupId,
		);

		// second registration with the same phone must not create a duplicate
		await Redis.del(otpRateLimitKey(normalized(p))); // avoid the rate limit for the login path
		await registerBuyer({
			firstName: "Ada",
			lastName: "Obi",
			phone: p,
			campusId: oid(),
		});
		const again = await getUserByPhoneDB({ phone: p });
		expect(must(again)._id.toString()).toBe(must(user)._id.toString());
	});

	it("blocks vendor registration for an existing buyer phone", async () => {
		const p = phone();
		await registerBuyer({
			firstName: "Ada",
			lastName: "Obi",
			phone: p,
			campusId: oid(),
		});
		await Redis.del(otpRateLimitKey(normalized(p)));

		await expect(
			registerVendor({
				firstName: "Ada",
				lastName: "Obi",
				phone: p,
				campusId: oid(),
				email: `buyer-vendor-${Math.random().toString(36).slice(2)}@prechop.test`,
				businessName: "Ada's Kitchen",
			}),
		).rejects.toMatchObject({ appCode: "BUYER_ACCOUNT_EXISTS" });

		const user = await getUserByPhoneDB({ phone: p });
		const profile = await getVendorProfileByUserIdDB({
			userId: must(user)._id.toString(),
		});
		expect(profile).toBeNull();
	});

	it("upgrades an existing buyer account into a vendor profile", async () => {
		const p = phone();
		await registerBuyer({
			firstName: "Ada",
			lastName: "Obi",
			phone: p,
			campusId: oid(),
		});
		const user = await getUserByPhoneDB({ phone: p });
		const result = await becomeVendor({
			userId: must(user)._id.toString(),
			input: {
				businessName: "Ada's Kitchen",
				vendorType: VendorType.STUDENT_COOK,
				location: {
					locationType: LocationType.ON_CAMPUS,
					hostelOrStallName: "Moremi Hall",
				},
			},
		});

		expect(result).not.toBeNull();
		const vendor = must(result);
		expect(vendor.userId.toString()).toBe(must(user)._id.toString());
		expect(vendor.businessName).toBe("Ada's Kitchen");
		expect(vendor.hostelOrStallName).toBe("Moremi Hall");
		const upgraded = await getUserByPhoneDB({ phone: p });
		const vendorsGroupId = await getBuiltInGroupId(VENDORS_GROUP);
		expect(must(upgraded).groupIds.map((g) => g.toString())).toContain(
			vendorsGroupId,
		);
	});

	it("repairs a buyer account that already has a vendor profile but no vendor group", async () => {
		const p = phone();
		await registerBuyer({
			firstName: "Ada",
			lastName: "Obi",
			phone: p,
			campusId: oid(),
		});
		const user = must(await getUserByPhoneDB({ phone: p }));
		await createVendorProfileDB({
			payload: {
				userId: user._id.toString(),
				campusId: user.campusId.toString(),
				email: `repair-${Math.random().toString(36).slice(2)}@prechop.test`,
				businessName: "Old Kitchen",
			},
		});

		const result = await becomeVendor({
			userId: user._id.toString(),
			input: {
				businessName: "Repaired Kitchen",
				vendorType: VendorType.CAMPUS_STALL,
				location: {
					locationType: LocationType.ON_CAMPUS,
					hostelOrStallName: "Main Stall",
				},
			},
		});

		expect(must(result).businessName).toBe("Repaired Kitchen");
		expect(result?.hostelOrStallName).toBe("Main Stall");
		const upgraded = must(await getUserByPhoneDB({ phone: p }));
		const vendorsGroupId = await getBuiltInGroupId(VENDORS_GROUP);
		expect(upgraded.groupIds.map((g) => g.toString())).toContain(
			vendorsGroupId,
		);
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
		const vendorsGroupId = await getBuiltInGroupId(VENDORS_GROUP);
		expect(must(user).groupIds.map((g) => g.toString())).toContain(
			vendorsGroupId,
		);
		const profile = await getVendorProfileByUserIdDB({
			userId: must(user)._id.toString(),
		});
		expect(profile).not.toBeNull();
		expect(must(profile).businessName).toBe("Biz Kitchen");
	});
});
