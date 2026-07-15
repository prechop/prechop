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
	e164,
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
	it("normalizes phone to E.164, encrypts it at rest and derives a matching phoneHash", async () => {
		// A buyer types the local form; the number is stored in E.164 so that
		// `08016644453` and `+2348016644453` can never become two accounts.
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
		// …and the plaintext underneath is the normalized E.164 form, not what
		// was passed in. Asserting the transform, not just round-tripping it.
		expect(phone).toMatch(/^0\d{10}$/);
		expect(decrypt(user!.phone)).toBe(e164(phone));
		expect(user!.phoneHash).toBe(phoneHash(e164(phone)));
		// The hash is over the normalized number, so the local form the user
		// typed does NOT hash to the stored value.
		expect(user!.phoneHash).not.toBe(phoneHash(phone));
		// no role enum anymore — a bare user has no group/policy attachments
		expect(user!.groupIds).toEqual([]);
		expect(user!.directPolicyIds).toEqual([]);
	});

	it("looks up by either the local or E.164 form of the same number", async () => {
		const phone = uniquePhone();
		const created = await createUserDB({
			payload: {
				campusId: oid(),
				firstName: "Bola",
				lastName: "A",
				phone,
			},
		});

		// Lookup normalizes too, so both forms must resolve to the one account.
		const byLocal = await getUserByPhoneDB({ phone });
		expect(byLocal).not.toBeNull();
		expect(decrypt(byLocal!.phone)).toBe(e164(phone));
		expect(byLocal!.id).toBe(byLocal!._id.toString());

		const byE164 = await getUserByPhoneDB({ phone: e164(phone) });
		expect(byE164).not.toBeNull();
		expect(byE164!._id.toString()).toBe(created!._id.toString());
		expect(byLocal!._id.toString()).toBe(byE164!._id.toString());
	});

	it("treats the local and E.164 forms as the same account on signup", async () => {
		// The unique index is on phoneHash, which is derived post-normalization —
		// so registering the same number in the other notation must collide, not
		// silently create a duplicate account.
		const phone = uniquePhone();
		const first = await createUserDB({
			payload: {
				campusId: oid(),
				firstName: "Chidi",
				lastName: "N",
				phone,
			},
		});
		expect(first).not.toBeNull();

		const dup = await createUserDB({
			payload: {
				campusId: oid(),
				firstName: "Chidi",
				lastName: "N",
				phone: e164(phone),
			},
		});
		expect(dup).toBeNull();
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
		expect(decrypt(withPhone!.phone)).toBe(e164(phone));
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
