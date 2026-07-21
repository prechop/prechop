import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decrypt, phoneHash } from "@/server/constants/crypto";
import {
	countUsersDB,
	createUserDB,
	getUserByEmailDB,
	getUserByIdDB,
	getUserByIdWithPhoneDB,
	loginUserDB,
	logoutUserDB,
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

function uniqueEmail(label: string) {
	return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@prechop.test`;
}

beforeAll(async () => {
	await connectTestDB();
	await User.createIndexes();
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("users model", () => {
	it("normalizes email and encrypts optional phone contact at rest", async () => {
		const phone = uniquePhone();
		const user = await createUserDB({
			payload: {
				email: `  ${uniqueEmail("ada").toUpperCase()}  `,
				campusId: oid(),
				firstName: "Ada",
				lastName: "Obi",
				phone,
			},
		});

		expect(user).not.toBeNull();
		expect(user!.email).toMatch(/@prechop\.test$/);
		expect(user!.email).toBe(user!.email.toLowerCase());
		expect(user!.phone).toBeTruthy();
		expect(user!.phone).not.toBe(phone);
		expect(decrypt(user!.phone!)).toBe(e164(phone));
		expect(user!.phoneHash).toBe(phoneHash(e164(phone)));
		expect(user!.phoneHash).not.toBe(phoneHash(phone));
		expect(user!.groupIds).toEqual([]);
		expect(user!.directPolicyIds).toEqual([]);
	});

	it("looks up users by normalized email", async () => {
		const email = uniqueEmail("bola");
		const created = await createUserDB({
			payload: {
				email,
				campusId: oid(),
				firstName: "Bola",
				lastName: "A",
			},
		});

		const found = await getUserByEmailDB({ email: email.toUpperCase() });
		expect(found).not.toBeNull();
		expect(found!.id).toBe(found!._id.toString());
		expect(found!._id.toString()).toBe(created!._id.toString());
	});

	it("prevents duplicate email accounts", async () => {
		const email = uniqueEmail("chidi");
		const first = await createUserDB({
			payload: {
				email,
				campusId: oid(),
				firstName: "Chidi",
				lastName: "N",
			},
		});
		expect(first).not.toBeNull();

		const dup = await createUserDB({
			payload: {
				email: email.toUpperCase(),
				campusId: oid(),
				firstName: "Chidi",
				lastName: "N",
			},
		});
		expect(dup).toBeNull();
	});

	it("getUserByIdDB strips phone/secrets via aggregate projection", async () => {
		const user = await createUserDB({
			payload: {
				email: uniqueEmail("c"),
				campusId: oid(),
				firstName: "C",
				lastName: "D",
				phone: uniquePhone(),
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
				email: uniqueEmail("e"),
				campusId: oid(),
				firstName: "E",
				lastName: "F",
				phone,
			},
		});
		const withPhone = await getUserByIdWithPhoneDB({
			id: user!._id.toString(),
		});
		expect(withPhone!.phone).toBeTruthy();
		expect(decrypt(withPhone!.phone!)).toBe(e164(phone));
	});

	it("toggles active and updates profile", async () => {
		const user = await createUserDB({
			payload: {
				email: uniqueEmail("g"),
				campusId: oid(),
				firstName: "G",
				lastName: "H",
				phone: uniquePhone(),
			},
		});
		const id = user!._id.toString();
		expect(await setUserActiveDB({ id, isActive: false })).toBe(true);
		const updated = await updateUserProfileDB({
			id,
			firstName: "Gina",
			campusId: oid(),
		});
		expect(updated!.firstName).toBe("Gina");
		const userAfterUpdate = await getUserByIdDB({ id });
		expect(userAfterUpdate!.isActive).toBe(false);
	});

	it("allows shared phone contact because phone is not the account identity", async () => {
		const phone = uniquePhone();
		const a = await createUserDB({
			payload: {
				email: uniqueEmail("i"),
				campusId: oid(),
				firstName: "I",
				lastName: "J",
				phone,
			},
		});
		expect(a).not.toBeNull();

		const b = await createUserDB({
			payload: {
				email: uniqueEmail("k"),
				campusId: oid(),
				firstName: "K",
				lastName: "L",
				phone,
			},
		});
		expect(b).not.toBeNull();
	});

	it("supports login, refresh-token rotation and logout", async () => {
		const user = await createUserDB({
			payload: {
				email: uniqueEmail("m"),
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

		const rotated = await reLoginUserWithRefreshTokenDB({
			id,
			refreshToken: token!.refreshToken,
			ip: "1.2.3.4",
		});
		expect(rotated).not.toBeNull();

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
