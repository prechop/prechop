import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decrypt } from "@/server/constants/crypto";
import { createSchoolDB } from "@/server/models/schools";
import { getVendorWithSecretsDB } from "@/server/models/vendorProfiles";
import { paystackProvider } from "@/server/providers/paystack";
import { resendProvider } from "@/server/providers/resend";
import { invalidateSiteConfigsCache } from "@/server/services/siteConfigs/getSiteConfigs";
import { setBankDetails } from "@/server/services/vendors/bankDetails";
import { listBanks } from "@/server/services/vendors/banks";
import {
	confirmProfileImage,
	presignProfileImage,
} from "@/server/services/vendors/profileImage";
import { listVendorSchools } from "@/server/services/vendors/schools";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeVendor } from "../helpers/factories";

beforeAll(async () => {
	await connectTestDB();
	invalidateSiteConfigsCache();
	vi.spyOn(resendProvider, "sendVendorWelcome").mockResolvedValue(
		undefined as never,
	);
	vi.spyOn(paystackProvider, "resolveAccountNumber").mockResolvedValue({
		account_number: "0123456789",
		account_name: "Ada Obi",
	});
	vi.spyOn(paystackProvider, "getBanks").mockResolvedValue([
		{ name: "GTBank", code: "058", active: true },
	]);
	vi.spyOn(paystackProvider, "createSubaccount").mockResolvedValue({
		subaccount_code: "ACCT_gen",
		account_number: "0123456789",
		account_name: "Ada Obi",
	});
});

afterAll(async () => {
	vi.restoreAllMocks();
	await dropAndDisconnect();
});

describe("setBankDetails", () => {
	it("resolves account, creates a subaccount and encrypts the account number", async () => {
		const { userId, vendorId } = await makeVendor();
		const updated = await setBankDetails({
			userId,
			bankCode: "058",
			accountNumber: "0123456789",
		});
		expect(updated!.paystackSubaccountCode).toBe("ACCT_gen");
		expect(updated!.bankName).toBe("GTBank");
		expect(updated!.accountName).toBe("Ada Obi");

		const secrets = await getVendorWithSecretsDB({ id: vendorId });
		expect(decrypt(secrets!.accountNumber!)).toBe("0123456789");
	});
});

describe("listBanks / listVendorSchools", () => {
	it("lists banks from the provider", async () => {
		const banks = await listBanks();
		expect(banks[0].code).toBe("058");
	});

	it("lists only active schools", async () => {
		await createSchoolDB({
			payload: { name: `S-${oid()}`, state: "Lagos", type: "University" },
		});
		const schools = await listVendorSchools();
		expect(schools.every((s) => s.isActive)).toBe(true);
	});
});

describe("profileImage", () => {
	it("presigns an upload URL and confirms the image", async () => {
		const { userId, vendorId } = await makeVendor();
		const presigned = await presignProfileImage({
			userId,
			mimeType: "image/jpeg",
		});
		expect(presigned.uploadUrl).toContain("http");
		expect(presigned.key).toContain("vendor-profiles/");

		const confirmed = await confirmProfileImage({
			userId,
			imageUrl: "https://img.test/pic.jpg",
		});
		expect(confirmed!.profileImageUrl).toBe("https://img.test/pic.jpg");
		void vendorId;
	});

	it("rejects an unsupported mime type", async () => {
		const { userId } = await makeVendor();
		await expect(
			presignProfileImage({
				userId,
				mimeType: "application/x-msdownload",
			}),
		).rejects.toThrow();
	});
});
