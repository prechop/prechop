import { describe, expect, it } from "vitest";
import { encrypt } from "@/server/constants/crypto";
import type { IUser } from "@/server/models/users/types";
import { toPublicUser } from "@/server/services/users/toPublicUser";

const resolved = { groups: ["Buyers"], permissions: ["buyer:order:read"] };

function baseUser(overrides: Partial<IUser> = {}): IUser {
	return {
		_id: "507f1f77bcf86cd799439011",
		campusId: "507f1f77bcf86cd799439012",
		// `IUser` declares `email: string` as required even though the users
		// schema has no email path at all, so a real document never carries one.
		// Supplied here only to satisfy the type — see HANDOFF.
		email: "ada@prechop.test",
		groupIds: [],
		directPolicyIds: [],
		firstName: "Ada",
		lastName: "Obi",
		phone: encrypt("08012345678"),
		phoneHash: "hash",
		isActive: true,
		deleted: false,
		refreshTokens: [{ refreshToken: "secret", deadline: new Date() }],
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-01"),
		...overrides,
	};
}

describe("toPublicUser", () => {
	it("decrypts phone and strips secrets", () => {
		const pub = toPublicUser(baseUser(), resolved);
		expect(pub.phone).toBe("08012345678");
		expect(pub).not.toHaveProperty("phoneHash");
		expect(pub).not.toHaveProperty("refreshTokens");
		expect(pub).not.toHaveProperty("deleted");
	});

	it("shapes the public fields with resolved IAM", () => {
		const pub = toPublicUser(baseUser(), resolved);
		expect(pub.id).toBe("507f1f77bcf86cd799439011");
		expect(pub.groups).toEqual(["Buyers"]);
		expect(pub.permissions).toEqual(["buyer:order:read"]);
		expect(pub.firstName).toBe("Ada");
		expect(pub.isActive).toBe(true);
	});

	it("prefers `id` over `_id` when present", () => {
		const pub = toPublicUser(baseUser({ id: "the-id" }), resolved);
		expect(pub.id).toBe("the-id");
	});

	it("omits phone when none is present (aggregate shape)", () => {
		const pub = toPublicUser(
			baseUser({ phone: undefined as unknown as string }),
			resolved,
		);
		expect(pub.phone).toBeUndefined();
	});
});
