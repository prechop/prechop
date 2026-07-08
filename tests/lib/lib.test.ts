import { afterAll, describe, expect, it } from "vitest";
import { DB_NAME } from "@/server/constants/environments";
import { UserRole } from "@/server/models/enums";
import { Redis } from "@/server/databases/redis";
import { getClientIp, getUserAgent } from "@/server/lib/clientIp";
import { csrfReject } from "@/server/lib/csrf";
import { created, fail, handleError, ok } from "@/server/lib/response";
import {
	applyRateLimitHeaders,
	enforceRateLimit,
} from "@/server/lib/rateLimit";
import {
	assertAdmin,
	assertBuyer,
	assertRole,
	assertVendor,
	type AuthResult,
} from "@/server/lib/auth";
import { getAuthCookieOptions } from "@/server/lib/cookies";
import { presignImageUpload } from "@/server/lib/upload";
import { validationError } from "@/server/constants/errors";

const rlKeys = new Set<string>();

afterAll(async () => {
	if (rlKeys.size) await Redis.del(...rlKeys);
});

function req(headers: Record<string, string> = {}, method = "GET"): Request {
	return new Request("https://prechop.ng/api/x", { method, headers });
}

describe("clientIp", () => {
	it("prefers cf-connecting-ip, then x-real-ip", () => {
		expect(getClientIp(req({ "cf-connecting-ip": "1.1.1.1" }))).toBe(
			"1.1.1.1",
		);
		expect(getClientIp(req({ "x-real-ip": "2.2.2.2" }))).toBe("2.2.2.2");
	});

	it("falls back to the first XFF hop (untrusted proxy)", () => {
		expect(
			getClientIp(req({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" })),
		).toBe("3.3.3.3");
	});

	it("returns 'unknown' with no headers", () => {
		expect(getClientIp(req())).toBe("unknown");
		expect(getUserAgent(req())).toBe("unknown");
		expect(getUserAgent(req({ "user-agent": "curl" }))).toBe("curl");
	});
});

describe("csrfReject", () => {
	it("passes safe methods", () => {
		expect(csrfReject(req({}, "GET"))).toBeNull();
	});

	it("passes an allowed origin and rejects a foreign one", () => {
		expect(
			csrfReject(req({ origin: "https://prechop.ng" }, "POST")),
		).toBeNull();
		expect(csrfReject(req({ origin: "https://evil.com" }, "POST"))).toBe(
			"Origin not allowed",
		);
	});

	it("falls back to Referer, then rejects when both are missing", () => {
		expect(
			csrfReject(req({ referer: "https://prechop.ng/x" }, "POST")),
		).toBeNull();
		expect(csrfReject(req({ referer: "not a url" }, "POST"))).toBe(
			"Malformed Referer",
		);
		expect(csrfReject(req({}, "DELETE"))).toBe(
			"Missing Origin and Referer",
		);
	});
});

describe("response helpers", () => {
	it("ok/created/fail build the right envelope + status", async () => {
		const okRes = ok({ a: 1 }, "done");
		expect(okRes.status).toBe(200);
		expect(await okRes.json()).toEqual({ code: 200, message: "done", data: { a: 1 } });

		const createdRes = created({ id: 1 });
		expect(createdRes.status).toBe(201);

		const failRes = fail(400, "bad");
		expect(failRes.status).toBe(400);
	});

	it("handleError maps an AppError to its status + appCode", async () => {
		const res = handleError(validationError("nope"));
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.appCode).toBe("VALIDATION_ERROR");
	});

	it("handleError maps an unknown error to 500", async () => {
		const res = handleError(new Error("boom"));
		expect(res.status).toBe(500);
	});
});

describe("rateLimit", () => {
	it("allows requests under the limit and blocks over it", async () => {
		const ip = `9.9.9.${Math.floor(Math.random() * 255)}`;
		rlKeys.add(`rate-limit:${DB_NAME}:${ip}`);
		const options = { windowMs: 60_000, maxRequests: 2 };
		const r = () => req({ "x-real-ip": ip }, "GET");

		const first = await enforceRateLimit(r(), options);
		expect(first.allowed).toBe(true);
		await enforceRateLimit(r(), options);
		const third = await enforceRateLimit(r(), options);
		expect(third.allowed).toBe(false);
		expect(third.retryAfterSeconds).toBeGreaterThan(0);
	});

	it("applyRateLimitHeaders sets the X-RateLimit-* headers", () => {
		const res = new Response("x");
		applyRateLimitHeaders(res, {
			allowed: false,
			limit: 5,
			remaining: 0,
			retryAfterSeconds: 30,
		});
		expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
		expect(res.headers.get("Retry-After")).toBe("30");
	});
});

describe("auth role guards", () => {
	function auth(role: UserRole): AuthResult {
		return {
			userId: "u",
			token: {} as never,
			refreshed: false,
			role,
			campusId: "c",
			isActive: true,
		};
	}

	it("assertRole allows listed roles and rejects others", () => {
		expect(() =>
			assertRole(auth(UserRole.VENDOR), [UserRole.VENDOR]),
		).not.toThrow();
		expect(() =>
			assertRole(auth(UserRole.BUYER), [UserRole.VENDOR]),
		).toThrow();
	});

	it("assertAdmin/Vendor/Buyer enforce the specific role", () => {
		expect(() => assertAdmin(auth(UserRole.SUPER_ADMIN))).not.toThrow();
		expect(() => assertAdmin(auth(UserRole.BUYER))).toThrow();
		expect(() => assertVendor(auth(UserRole.VENDOR))).not.toThrow();
		expect(() => assertVendor(auth(UserRole.BUYER))).toThrow();
		expect(() => assertBuyer(auth(UserRole.BUYER))).not.toThrow();
		expect(() => assertBuyer(auth(UserRole.VENDOR))).toThrow();
	});
});

describe("cookies + upload helpers", () => {
	it("getAuthCookieOptions returns dev-safe defaults", () => {
		const opts = getAuthCookieOptions({ maxAge: 100 });
		expect(opts.httpOnly).toBe(true);
		expect(opts.path).toBe("/");
		expect(opts.maxAge).toBe(100);
		// dev (not prod): sameSite lax, insecure
		expect(opts.sameSite).toBe("lax");
		expect(opts.secure).toBe(false);
	});

	it("presignImageUpload returns a presigned URL result", async () => {
		const res = await presignImageUpload({
			folder: "menu-items",
			mimeType: "image/png",
		});
		expect(res.uploadUrl).toContain("http");
		expect(res.key).toContain("menu-items/");
	});
});
