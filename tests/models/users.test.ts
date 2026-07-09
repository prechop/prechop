import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decrypt, phoneHash } from "@/server/constants/crypto";
import {
	countUsersDB,
	createUserDB,
	getUserByIdDB,
	getUserByIdWithPhoneDB,
	getUserByPhoneDB,
	loginUserDB,
	logoutUserDB,
	markPhoneVerifiedDB,
	reLoginUserWithRefreshTokenDB,
	setUserActiveDB,
	User,
	updateUserProfileDB,
} from "@/server/models/users";
import {
	connectTestDB,
	dropAndDisconnect,
	oid,
	uniquePhone,
} from "../helpers/db";

beforeAll(async () => {
	await connectTestDB();
	// Ensure the unique phoneHash index exists before the duplicate-key test.
	await User.createIndexes();
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("users model", () => {
	it("encrypts phone at rest and derives a matching phoneHash", async () => {
		const phone = uniquePhone();
		const user = await createUserDB({
			payload: {
				campusId: oid(),
				firstName: "Ada",
				lastName: "Obi",
				phone,
			},
		});
		expect(user).not.toBeNull();
		// stored phone is ciphertext, not plaintext
		expect(user!.phone).not.toBe(phone);
		expect(decrypt(user!.phone)).toBe(phone);
		expect(user!.phoneHash).toBe(phoneHash(phone));
		// no role enum anymore — a bare user has no group/policy attachments
		expect(user!.groupIds).toEqual([]);
		expect(user!.directPolicyIds).toEqual([]);
	});

	it("looks up by phone and returns a decryptable doc", async () => {
		const phone = uniquePhone();
		await createUserDB({
			payload: {
				campusId: oid(),
				firstName: "Bola",
				lastName: "A",
				phone,
			},
		});
		const found = await getUserByPhoneDB({ phone });
		expect(found).not.toBeNull();
		expect(decrypt(found!.phone)).toBe(phone);
		expect(found!.id).toBe(found!._id.toString());
	});

	it("getUserByIdDB strips phone/secrets via aggregate projection", async () => {
		const phone = uniquePhone();
		const user = await createUserDB({
			payload: {
				campusId: oid(),
				firstName: "C",
				lastName: "D",
				phone,
			},
		});
		const byId = await getUserByIdDB({ id: user!._id.toString() });
		expect(byId).not.toBeNull();
		expect(byId!.phone).toBeUndefined();
		expect(byId!.phoneHash).toBeUndefined();
	});

	it("getUserByIdWithPhoneDB includes encrypted phone", async () => {
		const phone = uniquePhone();
		const user = await createUserDB({
			payload: {
				campusId: oid(),
				firstName: "E",
				lastName: "F",
				phone,
			},
		});
		const withPhone = await getUserByIdWithPhoneDB({
			id: user!._id.toString(),
		});
		expect(decrypt(withPhone!.phone)).toBe(phone);
	});

	it("marks phone verified, toggles active, updates profile", async () => {
		const user = await createUserDB({
			payload: {
				campusId: oid(),
				firstName: "G",
				lastName: "H",
				phone: uniquePhone(),
			},
		});
		const id = user!._id.toString();
		expect(await markPhoneVerifiedDB({ id })).toBe(true);
		expect(await setUserActiveDB({ id, isActive: false })).toBe(true);
		const updated = await updateUserProfileDB({
			id,
			firstName: "Gina",
			campusId: oid(),
		});
		expect(updated!.firstName).toBe("Gina");
		const verified = await getUserByIdDB({ id });
		expect(verified!.isPhoneVerified).toBe(true);
		expect(verified!.isActive).toBe(false);
	});

	it("rejects duplicate phoneHash (unique index)", async () => {
		const phone = uniquePhone();
		const a = await createUserDB({
			payload: {
				campusId: oid(),
				firstName: "I",
				lastName: "J",
				phone,
			},
		});
		expect(a).not.toBeNull();
		const dup = await createUserDB({
			payload: {
				campusId: oid(),
				firstName: "K",
				lastName: "L",
				phone,
			},
		});
		// create fn swallows the duplicate-key error and returns null
		expect(dup).toBeNull();
	});

	it("supports login → refresh-token rotation → logout", async () => {
		const user = await createUserDB({
			payload: {
				campusId: oid(),
				firstName: "M",
				lastName: "N",
				phone: uniquePhone(),
			},
		});
		const id = user!._id.toString();
		const token = await loginUserDB({ id, ip: "1.2.3.4" });
		expect(token).not.toBeNull();
		expect(token!.refreshToken).toBeTruthy();

		// The same refresh token can be exchanged exactly once (atomic claim).
		const rotated = await reLoginUserWithRefreshTokenDB({
			id,
			refreshToken: token!.refreshToken,
			ip: "1.2.3.4",
		});
		expect(rotated).not.toBeNull();

		// Re-using the now-consumed refresh token fails.
		const reuse = await reLoginUserWithRefreshTokenDB({
			id,
			refreshToken: token!.refreshToken,
			ip: "1.2.3.4",
		});
		expect(reuse).toBeNull();

		expect(
			await logoutUserDB({ id, refreshToken: rotated!.refreshToken }),
		).toBe(true);
	});

	it("counts only non-deleted users", async () => {
		const count = await countUsersDB();
		expect(count).toBeGreaterThan(0);
	});
});
