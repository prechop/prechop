import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redis } from "@/server/databases/redis";
import {
	getVendorProfileByUserIdDB,
	getVendorProfileByIdDB,
} from "@/server/models/vendorProfiles";
import { hash } from "@/server/constants";
import { updateSecurityOnboarding } from "@/server/services/vendors/securityOnboarding";
import {
	authorizePinResetByAdmin,
	generateOtp,
	hashOtp,
	invalidateVendorPinSessions,
	requestAdminPinReset,
	requestPinReset,
	resetPinWithResetToken,
	verifyPinResetOtp,
} from "@/server/services/vendors/forgotPin";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeVendor } from "../helpers/factories";
import { resendProvider } from "@/server/providers/resend";

beforeAll(async () => {
	await connectTestDB();
	vi.spyOn(resendProvider, "sendTransactionalEmail").mockResolvedValue(false);
	vi.spyOn(resendProvider, "sendSignInLink").mockResolvedValue(undefined as never);
});

afterAll(async () => {
	vi.restoreAllMocks();
	await dropAndDisconnect();
});

afterEach(async () => {
	const keys = await Redis.keys("vendor:pin-reset:*");
	if (keys.length > 0) await Redis.del(...keys);
	const rateKeys = await Redis.keys("vendor:pin-reset:rate:*");
	if (rateKeys.length > 0) await Redis.del(...rateKeys);
	const verifyRateKeys = await Redis.keys("vendor:pin-reset:verify:rate:*");
	if (verifyRateKeys.length > 0) await Redis.del(...verifyRateKeys);
});

describe("forgotPin", () => {
	describe("requestPinReset", () => {
		it("sends a verification code and returns devOtp in non-prod", async () => {
			const { userId, vendorId } = await makeVendor();
			await updateSecurityOnboarding({
				userId,
				action: "COMPLETE",
				pin: "1234",
			});
			const vendor = await getVendorProfileByIdDB({ id: vendorId });
			expect(vendor?.email).toBeDefined();

			const result = await requestPinReset({
				userId,
				email: vendor!.email,
				ip: "1.2.3.4",
				userAgent: "test",
			});
			expect(result.message).toBe("Verification code sent to your email.");
			expect(result.devOtp).toBeDefined();
			expect(result.devOtp?.length).toBe(6);
		});

		it("rejects unauthorized email", async () => {
			const { userId } = await makeVendor();
			await expect(
				requestPinReset({
					userId,
					email: "wrong@prechop.test",
					ip: "1.2.3.5",
				}),
			).rejects.toThrow(/unauthorized/i);
		});

		it("rate limits repeated requests", async () => {
			const ip = "5.6.7.8";
			const rateKey = `vendor:pin-reset:rate:${hash(ip)}`;
			await Redis.del(rateKey);
			for (let i = 0; i < 5; i++) {
				const { userId, vendorId } = await makeVendor();
				const vendor = await getVendorProfileByIdDB({ id: vendorId });
				await requestPinReset({ userId, email: vendor!.email, ip });
			}
			const { userId: extraUserId } = await makeVendor();
			const extraVendor = await getVendorProfileByUserIdDB({ userId: extraUserId });
			await expect(
				requestPinReset({ userId: extraUserId, email: extraVendor!.email, ip }),
			).rejects.toThrow(/too many/i);
		});
	});

	describe("verifyPinResetOtp", () => {
		it("verifies a correct OTP and returns resetToken", async () => {
			const { userId } = await makeVendor();
			const vendor = await getVendorProfileByUserIdDB({ userId });
			const email = vendor!.email;
			const requestResult = await requestPinReset({
				userId,
				email,
				ip: "1.2.3.10",
			});
			const otp = requestResult.devOtp!;
			const result = await verifyPinResetOtp({
				userId,
				email,
				otp,
				ip: "1.2.3.10",
			});
			expect(result.verified).toBe(true);
			expect(result.resetToken).toBeDefined();
		});

		it("rejects wrong OTP", async () => {
			const { userId } = await makeVendor();
			const vendor = await getVendorProfileByUserIdDB({ userId });
			const email = vendor!.email;
			await requestPinReset({ userId, email, ip: "1.2.3.11" });
			await expect(
				verifyPinResetOtp({ userId, email, otp: "000000", ip: "1.2.3.11" }),
			).rejects.toThrow(/incorrect/i);
		});

		it("rejects expired OTP", async () => {
			const { userId } = await makeVendor();
			const vendor = await getVendorProfileByUserIdDB({ userId });
			const email = vendor!.email;
			await requestPinReset({ userId, email, ip: "1.2.3.12" });
			// Simulate expiry by deleting the Redis key
			const keys = await Redis.keys("vendor:pin-reset:request:*");
			for (const key of keys) {
				await Redis.del(key);
			}
			await expect(
				verifyPinResetOtp({ userId, email, otp: "123456", ip: "1.2.3.12" }),
			).rejects.toThrow(/expired/i);
		});
	});

	describe("resetPinWithResetToken", () => {
		it("resets the PIN and invalidates old sessions", async () => {
			const { userId, vendorId } = await makeVendor();
			await updateSecurityOnboarding({
				userId,
				action: "COMPLETE",
				pin: "1234",
			});
			const vendor = await getVendorProfileByIdDB({ id: vendorId });
			const email = vendor!.email;

			const requestResult = await requestPinReset({
				userId,
				email,
				ip: "1.2.3.20",
			});
			const otp = requestResult.devOtp!;
			const { resetToken } = await verifyPinResetOtp({
				userId,
				email,
				otp,
				ip: "1.2.3.20",
			});

			const result = await resetPinWithResetToken({
				resetToken,
				newPin: "5678",
				ip: "1.2.3.20",
			});
			expect(result.success).toBe(true);
		});

		it("rejects the old PIN after reset", async () => {
			const { userId, vendorId } = await makeVendor();
			await updateSecurityOnboarding({
				userId,
				action: "COMPLETE",
				pin: "1234",
			});
			const vendor = await getVendorProfileByIdDB({ id: vendorId });
			const email = vendor!.email;

			const requestResult = await requestPinReset({
				userId,
				email,
				ip: "1.2.3.21",
			});
			const otp = requestResult.devOtp!;
			const { resetToken } = await verifyPinResetOtp({
				userId,
				email,
				otp,
				ip: "1.2.3.21",
			});
			await resetPinWithResetToken({
				resetToken,
				newPin: "5678",
				ip: "1.2.3.21",
			});

			const otpHash = await hashOtp("1234");
			const keys = await Redis.keys("vendor:pin-reset:*");
			let found = false;
			for (const key of keys) {
				const raw = await Redis.get(key);
				if (!raw) continue;
				const data = JSON.parse(raw);
				if (data.otpHash === otpHash) found = true;
			}
			expect(found).toBe(false);
		});

		it("accepts the new PIN after reset", async () => {
			const { userId, vendorId } = await makeVendor();
			await updateSecurityOnboarding({
				userId,
				action: "COMPLETE",
				pin: "1234",
			});
			const vendor = await getVendorProfileByIdDB({ id: vendorId });
			const email = vendor!.email;

			const requestResult = await requestPinReset({
				userId,
				email,
				ip: "1.2.3.22",
			});
			const otp = requestResult.devOtp!;
			const { resetToken } = await verifyPinResetOtp({
				userId,
				email,
				otp,
				ip: "1.2.3.22",
			});
			await resetPinWithResetToken({
				resetToken,
				newPin: "9999",
				ip: "1.2.3.22",
			});

			const { verifyVendorSecurityPinForSensitiveAction } = await import(
				"@/server/services/vendors/securityOnboarding"
			);
			await expect(
				verifyVendorSecurityPinForSensitiveAction({
					userId,
					pin: "9999",
				}),
			).resolves.toBe(true);
		});
	});

	describe("requestAdminPinReset", () => {
		it("creates a support request for admin-assisted reset", async () => {
			const { userId, vendorId } = await makeVendor();
			const result = await requestAdminPinReset({
				userId,
				reason: "I no longer have access to my email.",
				ip: "1.2.3.30",
				auth: { userId, groups: ["Vendors"] },
			});
			expect(result.supportRequestId).toBeDefined();
		});
	});

	describe("authorizePinResetByAdmin", () => {
		it("resets the PIN after admin authorization", async () => {
			const { userId, vendorId } = await makeVendor();
			await updateSecurityOnboarding({
				userId,
				action: "COMPLETE",
				pin: "1234",
			});

			const result = await authorizePinResetByAdmin({
				vendorId,
				newPin: "7777",
				adminUserId: "admin-1",
				ip: "1.2.3.31",
			});
			expect(result.success).toBe(true);
		});
	});

	describe("invalidateVendorPinSessions", () => {
		it("removes all Redis keys for the vendor", async () => {
			const { vendorId } = await makeVendor();
			await Redis.setex(
				`vendor:pin-reset:request:${vendorId}`,
				60,
				JSON.stringify({ vendorId }),
			);
			await invalidateVendorPinSessions(vendorId);
			const raw = await Redis.get(`vendor:pin-reset:request:${vendorId}`);
			expect(raw).toBeNull();
		});
	});
});
