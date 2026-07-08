import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loginUserDB } from "@/server/models/users";
import { logout } from "@/server/services/auth/logout";
import reLoginUserWithRefreshToken from "@/server/services/auth/reLoginUserWithRefreshToken";
import { removeExpiredUsersTokens } from "@/server/services/auth/removeExpiredUsersTokens";
import { connectTestDB, dropAndDisconnect } from "../helpers/db";
import { makeUser } from "../helpers/factories";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

describe("logout", () => {
	it("no-ops for an undefined token", async () => {
		await expect(logout(undefined)).resolves.toBeUndefined();
	});

	it("no-ops for a garbage token", async () => {
		await expect(logout("not-a-jwt")).resolves.toBeUndefined();
	});

	it("revokes a real session's refresh token", async () => {
		const user = await makeUser();
		const token = await loginUserDB({ id: user!._id.toString(), ip: "" });
		await expect(logout(token!.refreshToken)).resolves.toBeUndefined();
	});
});

describe("reLoginUserWithRefreshToken", () => {
	it("rotates a valid refresh token and rejects reuse", async () => {
		const user = await makeUser();
		const id = user!._id.toString();
		const token = await loginUserDB({ id, ip: "1.1.1.1" });
		const rotated = await reLoginUserWithRefreshToken({
			id,
			refreshToken: token!.refreshToken,
			ip: "1.1.1.1",
		});
		expect(rotated).not.toBeNull();
		const reuse = await reLoginUserWithRefreshToken({
			id,
			refreshToken: token!.refreshToken,
			ip: "1.1.1.1",
		});
		expect(reuse).toBeNull();
	});
});

describe("removeExpiredUsersTokens", () => {
	it("runs the cron sweep and acknowledges", async () => {
		expect(await removeExpiredUsersTokens()).toBe(true);
	});
});
