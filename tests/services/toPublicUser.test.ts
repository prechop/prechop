import { describe, expect, it } from "vitest";
import { encrypt } from "@/server/constants/crypto";
import type { IUser } from "@/server/models/users/types";
import { UserRole } from "@/server/models/enums";
import { toPublicUser } from "@/server/services/users/toPublicUser";

function baseUser(overrides: Partial<IUser> = {}): IUser {
	return {
		_id: "507f1f77bcf86cd799439011",
		campusId: "507f1f77bcf86cd799439012",
		role: UserRole.BUYER,
		firstName: "Ada",
		lastName: "Obi",
		phone: encrypt("08012345678"),
		phoneHash: "hash",
		isPhoneVerified: true,
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
		const pub = toPublicUser(baseUser());
		expect(pub.phone).toBe("08012345678");
		expect(pub).not.toHaveProperty("phoneHash");
		expect(pub).not.toHaveProperty("refreshTokens");
		expect(pub).not.toHaveProperty("deleted");
	});

	it("shapes the public fields", () => {
		const pub = toPublicUser(baseUser());
		expect(pub.id).toBe("507f1f77bcf86cd799439011");
		expect(pub.role).toBe(UserRole.BUYER);
		expect(pub.firstName).toBe("Ada");
		expect(pub.isPhoneVerified).toBe(true);
		expect(pub.isActive).toBe(true);
	});

	it("prefers `id` over `_id` when present", () => {
		const pub = toPublicUser(baseUser({ id: "the-id" }));
		expect(pub.id).toBe("the-id");
	});

	it("returns empty phone when none is present (aggregate shape)", () => {
		const pub = toPublicUser(
			baseUser({ phone: undefined as unknown as string }),
		);
		expect(pub.phone).toBe("");
	});
});
