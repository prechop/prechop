import { sign } from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import decodeJwtToken from "@/server/constants/decodeJwtToken";
import {
	JWT_ACCESS_TOKEN_SECRET,
	JWT_REFRESH_TOKEN_SECRET,
} from "@/server/constants/environments";
import { generateAuthToken } from "@/server/models/users/utils";

describe("decodeJwtToken", () => {
	it("decodes a valid access token", async () => {
		const token = await generateAuthToken({
			userId: "user-123",
			ip: "1.2.3.4",
			shouldRegenerateRefreshToken: true,
		});
		expect(token).not.toBeNull();

		const decoded = await decodeJwtToken({
			accessToken: token!.accessToken,
		});
		expect(decoded).not.toBeNull();
		expect(decoded!.userId).toBe("user-123");
		expect(decoded!.ip).toBe("1.2.3.4");
	});

	it("decodes a valid refresh token", async () => {
		const token = await generateAuthToken({
			userId: "u9",
			ip: "9.9.9.9",
			shouldRegenerateRefreshToken: true,
		});
		const decoded = await decodeJwtToken({
			refreshToken: token!.refreshToken,
		});
		expect(decoded!.userId).toBe("u9");
	});

	it("throws when neither token is provided", async () => {
		await expect(decodeJwtToken({})).rejects.toThrow();
	});

	it("rejects a tampered token", async () => {
		const token = await generateAuthToken({
			userId: "u1",
			ip: "",
			shouldRegenerateRefreshToken: false,
		});
		const tampered = `${token!.accessToken.slice(0, -3)}abc`;
		await expect(
			decodeJwtToken({ accessToken: tampered }),
		).rejects.toThrow();
	});

	it("rejects a token signed with the wrong secret", async () => {
		const bad = sign({ data: { userId: "x" } }, "totally-wrong-secret", {
			algorithm: "HS256",
			expiresIn: 60,
		});
		await expect(decodeJwtToken({ accessToken: bad })).rejects.toThrow();
	});

	it("rejects an expired access token", async () => {
		const past = new Date(Date.now() - 60_000);
		const payload = {
			userId: "u",
			date: new Date(),
			ip: "",
			expiresIn: past,
			refreshTokenExpiresIn: new Date(Date.now() + 60_000),
		};
		const expired = sign({ data: payload }, JWT_ACCESS_TOKEN_SECRET, {
			algorithm: "HS256",
		});
		await expect(
			decodeJwtToken({ accessToken: expired }),
		).rejects.toThrow();
	});

	it("rejects a token signed with a non-HS256 alg (alg confusion guard)", async () => {
		// 'none' alg tokens must never be accepted.
		const header = Buffer.from(
			JSON.stringify({ alg: "none", typ: "JWT" }),
		).toString("base64url");
		const body = Buffer.from(
			JSON.stringify({ data: { userId: "x" } }),
		).toString("base64url");
		const noneToken = `${header}.${body}.`;
		await expect(
			decodeJwtToken({ accessToken: noneToken }),
		).rejects.toThrow();
	});
});

describe("generateAuthToken", () => {
	it("produces both tokens when refresh regeneration requested", async () => {
		const t = await generateAuthToken({
			userId: "abc",
			ip: "1.1.1.1",
			shouldRegenerateRefreshToken: true,
		});
		expect(t!.accessToken).toBeTruthy();
		expect(t!.refreshToken).toBeTruthy();
	});

	it("omits the refresh token when not requested", async () => {
		const t = await generateAuthToken({
			userId: "abc",
			ip: "",
			shouldRegenerateRefreshToken: false,
		});
		expect(t!.accessToken).toBeTruthy();
		expect(t!.refreshToken).toBe("");
	});

	it("secrets are present in the test env", () => {
		expect(JWT_ACCESS_TOKEN_SECRET.length).toBeGreaterThan(0);
		expect(JWT_REFRESH_TOKEN_SECRET.length).toBeGreaterThan(0);
	});
});
