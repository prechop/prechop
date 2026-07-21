import { afterAll, describe, expect, it } from "vitest";
import { DB_NAME } from "@/server/constants/environments";
import { validationError } from "@/server/constants/errors";
import { Redis } from "@/server/databases/redis";
import {
	type AuthResult,
	assertBuyer,
	assertVendor,
	hasPermission,
	requirePermission,
} from "@/server/lib/auth";
import { getClientIp, getUserAgent } from "@/server/lib/clientIp";
import { getAuthCookieOptions } from "@/server/lib/cookies";
import { csrfReject } from "@/server/lib/csrf";
import {
	applyRateLimitHeaders,
	enforceRateLimit,
} from "@/server/lib/rateLimit";
import { created, fail, handleError, ok } from "@/server/lib/response";
import { presignImageUpload } from "@/server/lib/upload";
import type { IPolicyStatement } from "@/server/models";

const rlKeys = new Set<string>();

afterAll(async () => {
	if (rlKeys.size) await Redis.del(...rlKeys);
});

function req(headers: Record<string, string> = {}, method = "GET"): Request {
	return new Request("https://prechop.ng/api/x", { method, headers });
}

describe("clientIp", () => {
	// tests/setup.ts pins TRUSTED_PROXY="0": no trusted edge. In that mode every
	// forwarded-IP header is client-supplied and therefore ignored (see the
	// spoofing regression block below). Updated from the pre-fix expectation that
	// these headers were echoed back — that was the vulnerability.
	it("ignores forwarded headers when there is no trusted proxy", () => {
		expect(getClientIp(req({ "cf-connecting-ip": "1.1.1.1" }))).toBe(
			"unknown",
		);
		expect(getClientIp(req({ "x-real-ip": "2.2.2.2" }))).toBe("unknown");
		expect(
			getClientIp(req({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" })),
		).toBe("unknown");
	});

	it("returns 'unknown' with no headers", () => {
		expect(getClientIp(req())).toBe("unknown");
		expect(getUserAgent(req())).toBe("unknown");
		expect(getUserAgent(req({ "user-agent": "curl" }))).toBe("curl");
	});
});

describe("clientIp — IP rate-limit spoofing (TRUSTED_PROXY unset)", () => {
	// REGRESSION: with no trusted proxy, client-supplied forwarded-IP headers must
	// NOT be honored — otherwise an attacker rotates `cf-connecting-ip` /
	// `x-real-ip` to mint a fresh rate-limit bucket per request and the limiter is
	// defeated (SMS-cost amplification on the OTP path). tests/setup.ts pins
	// TRUSTED_PROXY="0", so this exercises the untrusted-proxy path. The fix has
	// landed in src/server/lib/clientIp.ts; these pin it so it cannot regress.
	it("does not grant a fresh bucket per rotated cf-connecting-ip", () => {
		const a = getClientIp(req({ "cf-connecting-ip": "1.1.1.1" }));
		const b = getClientIp(req({ "cf-connecting-ip": "9.9.9.9" }));
		// Rotating the header must collapse to the SAME bucket, and must not echo
		// the attacker-chosen value.
		expect(a).toBe(b);
		expect(a).not.toBe("1.1.1.1");
	});

	it("does not grant a fresh bucket per rotated x-real-ip", () => {
		const a = getClientIp(req({ "x-real-ip": "2.2.2.2" }));
		const b = getClientIp(req({ "x-real-ip": "8.8.8.8" }));
		expect(a).toBe(b);
		expect(a).not.toBe("2.2.2.2");
	});
});

describe("csrfReject", () => {
	it("passes safe methods", () => {
		expect(csrfReject(req({}, "GET"))).toBeNull();
	});

	it("passes an allowed origin and rejects a foreign one", () => {
		expect(
			csrfReject(req({ origin: "https://prechop.com.ng" }, "POST")),
		).toBeNull();
		expect(csrfReject(req({ origin: "https://evil.com" }, "POST"))).toBe(
			"Origin not allowed",
		);
	});

	it("falls back to Referer, then rejects when both are missing", () => {
		expect(
			csrfReject(req({ referer: "https://prechop.com.ng/x" }, "POST")),
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
		expect(await okRes.json()).toEqual({
			code: 200,
			message: "done",
			data: { a: 1 },
		});

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

describe("auth permission guards", () => {
	function auth(statements: IPolicyStatement[], campusId = "c"): AuthResult {
		return {
			userId: "u",
			token: {} as never,
			refreshed: false,
			campusId,
			isActive: true,
			groups: [],
			permissions: [],
			statements,
		};
	}

	const vendorStatements: IPolicyStatement[] = [
		{ effect: "Allow", actions: ["vendorApp:manage", "menu:manage"] },
	];
	const buyerStatements: IPolicyStatement[] = [
		{
			effect: "Allow",
			actions: ["buyer:order:read", "buyer:order:create"],
		},
	];
	const adminStatements: IPolicyStatement[] = [
		{ effect: "Allow", actions: ["*"] },
	];

	it("requirePermission allows granted actions and rejects others", () => {
		expect(() =>
			requirePermission(auth(vendorStatements), "menu:manage"),
		).not.toThrow();
		expect(() =>
			requirePermission(auth(vendorStatements), "vendor:suspend"),
		).toThrow();
		expect(() =>
			requirePermission(auth(adminStatements), "vendor:suspend"),
		).not.toThrow();
	});

	it("explicit Deny overrides Allow", () => {
		const mixed: IPolicyStatement[] = [
			{ effect: "Allow", actions: ["*"] },
			{ effect: "Deny", actions: ["vendor:suspend"] },
		];
		expect(hasPermission(auth(mixed), "vendor:read")).toBe(true);
		expect(hasPermission(auth(mixed), "vendor:suspend")).toBe(false);
	});

	it("assertVendor / assertBuyer probe the app capabilities", () => {
		expect(() => assertVendor(auth(vendorStatements))).not.toThrow();
		expect(() => assertVendor(auth(buyerStatements))).toThrow();
		expect(() => assertBuyer(auth(buyerStatements))).not.toThrow();
		expect(() => assertBuyer(auth(vendorStatements))).toThrow();
	});

	it("campus-scoped condition matches the caller's campus", () => {
		const scoped: IPolicyStatement[] = [
			{
				effect: "Allow",
				actions: ["order:read"],
				condition: { campusId: "$user.campusId" },
			},
		];
		expect(
			hasPermission(auth(scoped, "campus-1"), "order:read", {
				resource: { campusId: "campus-1" },
			}),
		).toBe(true);
		expect(
			hasPermission(auth(scoped, "campus-1"), "order:read", {
				resource: { campusId: "campus-2" },
			}),
		).toBe(false);
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
