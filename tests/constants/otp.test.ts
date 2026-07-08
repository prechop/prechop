import { describe, expect, it } from "vitest";
import { generateOtp, hashOtp, verifyOtp } from "@/server/constants/otp";

describe("generateOtp", () => {
	it("is a 6-digit numeric string", () => {
		for (let i = 0; i < 50; i++) {
			const otp = generateOtp();
			expect(otp).toMatch(/^\d{6}$/);
		}
	});

	it("stays within [100000, 999999]", () => {
		for (let i = 0; i < 50; i++) {
			const n = Number(generateOtp());
			expect(n).toBeGreaterThanOrEqual(100000);
			expect(n).toBeLessThanOrEqual(999999);
		}
	});
});

describe("hashOtp/verifyOtp", () => {
	it("verifies a matching OTP", async () => {
		const digest = await hashOtp("123456");
		expect(digest).not.toBe("123456");
		expect(await verifyOtp("123456", digest)).toBe(true);
	});

	it("rejects a wrong OTP", async () => {
		const digest = await hashOtp("123456");
		expect(await verifyOtp("654321", digest)).toBe(false);
	});
});
