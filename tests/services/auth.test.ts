import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUYERS_GROUP } from "@/server/constants";
import {
	createUserDB,
	getUserByEmailDB,
	normalizeEmail,
	User,
} from "@/server/models/users";
import { signInWithGoogleProfile } from "@/server/services/auth/register";
import { getBuiltInGroupId, seedBuiltInIam } from "@/server/services/iam";
import { connectTestDB, dropAndDisconnect } from "../helpers/db";

function uniqueEmail(label: string): string {
	return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@prechop.test`;
}

async function googleSignIn(
	email: string,
	overrides: Partial<Parameters<typeof signInWithGoogleProfile>[0]> = {},
) {
	return signInWithGoogleProfile({
		email,
		firstName: "Ada",
		lastName: "Obi",
		profileImageUrl: "https://lh3.googleusercontent.com/a/test-avatar",
		googleSubject: `google-${Math.random().toString(36).slice(2)}`,
		emailVerified: true,
		ip: "1.2.3.4",
		...overrides,
	});
}

beforeAll(async () => {
	await connectTestDB();
	await seedBuiltInIam();
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("signInWithGoogleProfile", () => {
	it("creates a new active buyer from a verified Google account", async () => {
		const email = uniqueEmail("new-google");
		const subject = "google-new-user";

		const result = await googleSignIn(email, { googleSubject: subject });

		expect(result.token.accessToken).toBeTruthy();
		expect(result.user.email).toBe(normalizeEmail(email));
		expect(result.user.groups).toContain("Buyers");
		expect(result.user.profileImageUrl).toContain("test-avatar");

		const persisted = await getUserByEmailDB({ email });
		expect(persisted).not.toBeNull();
		expect(persisted?.isActive).toBe(true);
		expect(persisted?.googleSubject).toBe(subject);
		expect(persisted?.googleEmailVerified).toBe(true);
		expect(
			(persisted as { password?: unknown } | null)?.password,
		).toBeUndefined();
		const buyersGroupId = await getBuiltInGroupId(BUYERS_GROUP);
		expect(persisted?.groupIds.map((id) => id.toString())).toContain(
			buyersGroupId,
		);
	});

	it("links Google authentication to an existing email/password user without duplicating the account", async () => {
		const email = uniqueEmail("legacy-password");
		const buyersGroupId = await getBuiltInGroupId(BUYERS_GROUP);
		const existing = await createUserDB({
			payload: {
				firstName: "Legacy",
				lastName: "Buyer",
				email,
				groupIds: buyersGroupId ? [buyersGroupId] : [],
				isActive: true,
			},
		});
		expect(existing).not.toBeNull();

		const result = await googleSignIn(email, {
			firstName: "Google",
			lastName: "Linked",
			googleSubject: "google-existing-email",
		});

		const persisted = await getUserByEmailDB({ email });
		expect(result.user.id).toBe(existing?._id.toString());
		expect(persisted?._id.toString()).toBe(existing?._id.toString());
		expect(persisted?.googleSubject).toBe("google-existing-email");
		expect(persisted?.firstName).toBe("Google");
		expect(persisted?.lastName).toBe("Linked");
		expect(
			await User.countDocuments({ email: normalizeEmail(email) }),
		).toBe(1);
	});

	it("signs in an existing Google user again without creating a duplicate", async () => {
		const email = uniqueEmail("returning-google");
		await googleSignIn(email, { googleSubject: "google-returning" });

		const result = await googleSignIn(email.toUpperCase(), {
			googleSubject: "google-returning",
		});

		expect(result.token.accessToken).toBeTruthy();
		expect(
			await User.countDocuments({ email: normalizeEmail(email) }),
		).toBe(1);
		const persisted = await getUserByEmailDB({ email });
		expect(persisted?.googleSubject).toBe("google-returning");
	});

	it("does not require campus when Google creates a buyer", async () => {
		const email = uniqueEmail("no-campus");

		const result = await googleSignIn(email);

		expect(result.user.campusId).toBeUndefined();
		const persisted = await getUserByEmailDB({ email });
		expect(persisted?.campusId).toBeUndefined();
	});

	it("prevents duplicate users for the same normalized email", async () => {
		const email = uniqueEmail("duplicate-email");

		await googleSignIn(email, { googleSubject: "google-duplicate-first" });
		await googleSignIn(email.toUpperCase(), {
			googleSubject: "google-duplicate-second",
		});

		const normalized = normalizeEmail(email);
		expect(await User.countDocuments({ email: normalized })).toBe(1);
		const persisted = await getUserByEmailDB({ email });
		expect(persisted?.googleSubject).toBe("google-duplicate-second");
	});
});
