import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redis } from "@/server/databases/redis";
import { loginUserDB, User } from "@/server/models/users";
import { logout } from "@/server/services/auth/logout";
import reLoginUserWithRefreshToken from "@/server/services/auth/reLoginUserWithRefreshToken";
import { removeExpiredUsersTokens } from "@/server/services/auth/removeExpiredUsersTokens";
import { connectTestDB, dropAndDisconnect } from "../helpers/db";
import { makeUser } from "../helpers/factories";

// Refresh-token family tracking lives in the SHARED Redis with a TTL of the
// refresh-token max age (weeks). Left alone, every run would leak keys onto an
// instance other projects use, so every token this file mints is tracked and
// deleted in `afterAll` — including when a test fails.
const redisKeys = new Set<string>();

/** Mirror of the service's key scheme, so cleanup can find what it wrote. */
function trackToken(refreshToken: string): string {
	const d = crypto.createHash("sha256").update(refreshToken).digest("hex");
	redisKeys.add(`auth:rt:family:${d}`);
	redisKeys.add(`auth:rt:spent:${d}`);
	redisKeys.add(`auth:rt:handoff:${d}`);
	redisKeys.add(`auth:rt:lock:${d}`);
	return d;
}

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	// Family ids are values, not keys, so collect their revoked-markers before
	// dropping the mappings.
	const families = await Promise.all(
		[...redisKeys]
			.filter((k) => k.startsWith("auth:rt:family:"))
			.map((k) => Redis.get(k)),
	);
	for (const familyId of families) {
		if (familyId) redisKeys.add(`auth:rt:revoked:${familyId}`);
	}
	if (redisKeys.size) await Redis.del(...redisKeys);
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
	it("rotates a valid refresh token", async () => {
		const user = await makeUser();
		const id = user!._id.toString();
		const token = await loginUserDB({ id, ip: "1.1.1.1" });
		trackToken(token!.refreshToken);

		const rotated = await reLoginUserWithRefreshToken({
			id,
			refreshToken: token!.refreshToken,
			ip: "1.1.1.1",
		});
		expect(rotated).not.toBeNull();
		trackToken(rotated!.refreshToken);
		// A rotation issues a genuinely different token, or "rotation" is a no-op.
		expect(rotated!.refreshToken).not.toBe(token!.refreshToken);
	});

	it("returns one idempotent successor to simultaneous refresh requests", async () => {
		const user = await makeUser();
		const id = user!._id.toString();
		const token = await loginUserDB({ id, ip: "1.1.1.1" });
		trackToken(token!.refreshToken);
		const results = await Promise.all(
			Array.from({ length: 8 }, () =>
				reLoginUserWithRefreshToken({
					id,
					refreshToken: token!.refreshToken,
					ip: "1.1.1.1",
				}),
			),
		);
		for (const result of results) {
			expect(result?.refreshToken).toBe(results[0]?.refreshToken);
			expect(result?.accessToken).toBe(results[0]?.accessToken);
		}
		trackToken(results[0]!.refreshToken);
	});

	it("does not consume the browser credential when Redis is unavailable", async () => {
		const user = await makeUser();
		const id = user!._id.toString();
		const token = await loginUserDB({ id, ip: "1.1.1.1" });
		const get = vi
			.spyOn(Redis, "get")
			.mockRejectedValueOnce(new Error("redis down"));
		await expect(
			reLoginUserWithRefreshToken({
				id,
				refreshToken: token!.refreshToken,
				ip: "1.1.1.1",
			}),
		).rejects.toThrow("redis down");
		get.mockRestore();
		const stored = await User.findById(id).select("+refreshTokens");
		expect(
			stored?.refreshTokens?.some(
				(entry: { refreshToken: string }) =>
					entry.refreshToken === token!.refreshToken,
			),
		).toBe(true);
	});

	it("does not consume the browser credential on a temporary Mongo failure", async () => {
		const user = await makeUser();
		const id = user!._id.toString();
		const token = await loginUserDB({ id, ip: "1.1.1.1" });
		const update = vi
			.spyOn(User, "findOneAndUpdate")
			.mockImplementationOnce(() => {
				throw new Error("mongo down");
			});
		await expect(
			reLoginUserWithRefreshToken({
				id,
				refreshToken: token!.refreshToken,
				ip: "1.1.1.1",
			}),
		).rejects.toThrow("mongo down");
		update.mockRestore();
		const stored = await User.findById(id).select("+refreshTokens");
		expect(
			stored?.refreshTokens?.some(
				(entry: { refreshToken: string }) =>
					entry.refreshToken === token!.refreshToken,
			),
		).toBe(true);
	});

	it("preserves the three-session cap and evicts the oldest on login four", async () => {
		const user = await makeUser();
		const id = user!._id.toString();
		const sessions: Array<Awaited<ReturnType<typeof loginUserDB>>> = [];
		for (let i = 0; i < 4; i += 1) {
			sessions.push(await loginUserDB({ id, ip: `1.1.1.${i}` }));
		}
		const stored = await User.findById(id).select("+refreshTokens");
		expect(stored?.refreshTokens).toHaveLength(3);
		expect(
			stored?.refreshTokens?.some(
				(entry: { refreshToken: string }) =>
					entry.refreshToken === sessions[0]!.refreshToken,
			),
		).toBe(false);
		for (const session of sessions.slice(1))
			trackToken(session!.refreshToken);
	});

	it("treats a replayed token as theft and burns the whole family", async () => {
		// A replay after the short concurrency handoff is evidence the chain
		// forked. Rejecting only that request would leave a thief holding a live
		// successor, so the family is burned and both parties re-authenticate.
		const user = await makeUser();
		const id = user!._id.toString();
		const token = await loginUserDB({ id, ip: "1.1.1.1" });
		trackToken(token!.refreshToken);

		const rotated = await reLoginUserWithRefreshToken({
			id,
			refreshToken: token!.refreshToken,
			ip: "1.1.1.1",
		});
		trackToken(rotated!.refreshToken);
		const concurrent = await reLoginUserWithRefreshToken({
			id,
			refreshToken: token!.refreshToken,
			ip: "1.1.1.1",
		});
		expect(concurrent?.refreshToken).toBe(rotated!.refreshToken);
		const oldDigest = crypto
			.createHash("sha256")
			.update(token!.refreshToken)
			.digest("hex");
		await Redis.del(`auth:rt:handoff:${oldDigest}`);

		// Replaying the spent token is refused loudly — NOT as a routine null,
		// which the caller could not distinguish from an ordinary expiry.
		await expect(
			reLoginUserWithRefreshToken({
				id,
				refreshToken: token!.refreshToken,
				ip: "1.1.1.1",
			}),
		).rejects.toThrow(/log in again/i);

		// The live token from the same family is now inert too: the point of the
		// family burn is that the thief's token dies even though it was valid.
		await expect(
			reLoginUserWithRefreshToken({
				id,
				refreshToken: rotated!.refreshToken,
				ip: "1.1.1.1",
			}),
		).rejects.toThrow(/log in again/i);
	});

	it("returns null for an unknown token rather than crying theft", async () => {
		// An expired/unknown token is ordinary, not an attack: it must stay a
		// null so the client just re-authenticates quietly.
		const user = await makeUser();
		const id = user!._id.toString();
		const unknown = crypto.randomBytes(32).toString("hex");
		trackToken(unknown);

		await expect(
			reLoginUserWithRefreshToken({
				id,
				refreshToken: unknown,
				ip: "1.1.1.1",
			}),
		).resolves.toBeNull();
	});
});

describe("removeExpiredUsersTokens", () => {
	it("runs the cron sweep and acknowledges", async () => {
		expect(await removeExpiredUsersTokens()).toBe(true);
	});
});
