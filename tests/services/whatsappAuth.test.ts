import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	BUYERS_GROUP,
	hash,
	normalizeNigerianMobilePhone,
	phoneHash,
} from "@/server/constants";
import { Redis } from "@/server/databases";
import {
	createVendorProfileDB,
	setVendorStatusDB,
	VendorStatus,
} from "@/server/models";
import {
	createUserDB,
	getUserByVerifiedPhoneDB,
	User,
} from "@/server/models/users";
import { sendchampProvider } from "@/server/providers";
import {
	requestWhatsAppSignIn,
	resolvePostAuthRedirect,
	verifyWhatsAppSignIn,
} from "@/server/services/auth";
import { getBuiltInGroupId, seedBuiltInIam } from "@/server/services/iam";
import { connectTestDB, dropAndDisconnect, uniquePhone } from "../helpers/db";

const redisKeys = new Set<string>();

function trackChallenge(challengeId: string) {
	redisKeys.add(`auth:whatsapp:challenge:${hash(challengeId)}`);
	redisKeys.add(`auth:whatsapp:attempts:${hash(challengeId)}`);
}

function trackPhone(phone: string) {
	const normalized = normalizedPhone(phone);
	redisKeys.add(`auth:whatsapp:cooldown:${hash(normalized)}`);
	redisKeys.add(`auth:whatsapp:requests:${hash(normalized)}`);
	redisKeys.add(`auth:whatsapp:active:${hash(normalized)}`);
}

function normalizedPhone(phone: string): string {
	const normalized = normalizeNigerianMobilePhone(phone);
	if (!normalized)
		throw new Error("Test generated an invalid Nigerian phone.");
	return normalized;
}

beforeAll(async () => {
	await connectTestDB();
	await seedBuiltInIam();
	await User.createIndexes();
});

afterEach(async () => {
	vi.restoreAllMocks();
	if (redisKeys.size) await Redis.del(...redisKeys);
	redisKeys.clear();
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("WhatsApp passwordless authentication", () => {
	it("creates an account only after Sendchamp verifies the OTP", async () => {
		const phone = uniquePhone();
		trackPhone(phone);
		vi.spyOn(
			sendchampProvider,
			"createWhatsAppVerification",
		).mockResolvedValue({ reference: "VER-test-success" });
		vi.spyOn(
			sendchampProvider,
			"confirmWhatsAppVerification",
		).mockResolvedValue(true);

		const challenge = await requestWhatsAppSignIn({
			phone,
			next: "/vendor/onboarding",
		});
		trackChallenge(challenge.challengeId);
		expect(await getUserByVerifiedPhoneDB({ phone })).toBeNull();

		const result = await verifyWhatsAppSignIn({
			challengeId: challenge.challengeId,
			code: "012345",
			ip: "1.2.3.4",
		});
		expect(result.next).toBe("/vendor/onboarding");
		expect(result.user.groups).toContain("Buyers");
		expect(result.user.phone).toBe(normalizeNigerianMobilePhone(phone));
		expect(result.user.email).toBe("");
		const persisted = await getUserByVerifiedPhoneDB({ phone });
		expect(persisted?.phoneVerifiedAt).toBeInstanceOf(Date);
		expect(await resolvePostAuthRedirect(result.user)).toBe("/marketplace");
		expect(
			await resolvePostAuthRedirect(result.user, "/vendor/onboarding"),
		).toBe("/vendor/onboarding");

		const vendor = await createVendorProfileDB({
			payload: {
				userId: result.user.id,
				email: "vendor-whatsapp@prechop.test",
			},
		});
		expect(vendor).not.toBeNull();
		if (!vendor) throw new Error("Vendor profile was not created.");
		await setVendorStatusDB({
			id: vendor._id.toString(),
			status: VendorStatus.ACTIVE,
		});
		expect(
			await resolvePostAuthRedirect(result.user, "/vendor/onboarding"),
		).toBe("/dashboard");
		await setVendorStatusDB({
			id: vendor._id.toString(),
			status: VendorStatus.PENDING_REVIEW,
		});
		expect(
			await resolvePostAuthRedirect(result.user, "/vendor/onboarding"),
		).toBe("/dashboard");
	});

	it("promotes a single matching contact number instead of duplicating the account", async () => {
		const phone = uniquePhone();
		trackPhone(phone);
		const buyersGroupId = await getBuiltInGroupId(BUYERS_GROUP);
		const existing = await createUserDB({
			payload: {
				firstName: "Existing",
				lastName: "Buyer",
				email: `existing-${Date.now()}@prechop.test`,
				phone,
				groupIds: buyersGroupId ? [buyersGroupId] : [],
			},
		});
		expect(existing).not.toBeNull();
		vi.spyOn(
			sendchampProvider,
			"createWhatsAppVerification",
		).mockResolvedValue({ reference: "VER-test-existing" });
		vi.spyOn(
			sendchampProvider,
			"confirmWhatsAppVerification",
		).mockResolvedValue(true);

		const challenge = await requestWhatsAppSignIn({ phone });
		trackChallenge(challenge.challengeId);
		const result = await verifyWhatsAppSignIn({
			challengeId: challenge.challengeId,
			code: "123456",
			ip: "1.2.3.4",
		});
		expect(result.user.id).toBe(existing?._id.toString());
		expect(
			(await getUserByVerifiedPhoneDB({ phone }))?.phoneVerifiedAt,
		).toBeInstanceOf(Date);
	});

	it("rejects an incorrect code without creating an account", async () => {
		const phone = uniquePhone();
		trackPhone(phone);
		vi.spyOn(
			sendchampProvider,
			"createWhatsAppVerification",
		).mockResolvedValue({ reference: "VER-test-failure" });
		vi.spyOn(
			sendchampProvider,
			"confirmWhatsAppVerification",
		).mockResolvedValue(false);

		const challenge = await requestWhatsAppSignIn({ phone });
		trackChallenge(challenge.challengeId);
		await expect(
			verifyWhatsAppSignIn({
				challengeId: challenge.challengeId,
				code: "999999",
				ip: "1.2.3.4",
			}),
		).rejects.toThrow(/incorrect verification code/i);
		expect(await getUserByVerifiedPhoneDB({ phone })).toBeNull();
	});

	it("enforces resend cooldown and invalidates the previous challenge", async () => {
		const phone = uniquePhone();
		trackPhone(phone);
		vi.spyOn(
			sendchampProvider,
			"createWhatsAppVerification",
		).mockResolvedValue({ reference: "VER-test-expiry" });

		const challenge = await requestWhatsAppSignIn({ phone });
		trackChallenge(challenge.challengeId);
		await expect(requestWhatsAppSignIn({ phone })).rejects.toThrow(
			/wait before requesting/i,
		);
		await Redis.del(
			`auth:whatsapp:cooldown:${hash(normalizedPhone(phone))}`,
		);
		const resent = await requestWhatsAppSignIn({ phone });
		trackChallenge(resent.challengeId);
		await expect(
			verifyWhatsAppSignIn({
				challengeId: challenge.challengeId,
				code: "123456",
				ip: "1.2.3.4",
			}),
		).rejects.toThrow(/expired/i);
	});

	it("reuses the same verified phone account", async () => {
		const phone = uniquePhone();
		trackPhone(phone);
		vi.spyOn(
			sendchampProvider,
			"createWhatsAppVerification",
		).mockResolvedValue({ reference: "VER-test-repeat" });
		vi.spyOn(
			sendchampProvider,
			"confirmWhatsAppVerification",
		).mockResolvedValue(true);

		const first = await requestWhatsAppSignIn({ phone });
		trackChallenge(first.challengeId);
		const firstResult = await verifyWhatsAppSignIn({
			challengeId: first.challengeId,
			code: "123456",
			ip: "1.2.3.4",
		});
		await Redis.del(
			`auth:whatsapp:cooldown:${hash(normalizedPhone(phone))}`,
		);

		const second = await requestWhatsAppSignIn({ phone });
		trackChallenge(second.challengeId);
		const secondResult = await verifyWhatsAppSignIn({
			challengeId: second.challengeId,
			code: "123456",
			ip: "1.2.3.4",
		});
		expect(secondResult.user.id).toBe(firstResult.user.id);
		expect(
			await User.countDocuments({
				phoneHash: phoneHash(normalizedPhone(phone)),
				phoneVerifiedAt: { $type: "date" },
			}),
		).toBe(1);
	});
});
