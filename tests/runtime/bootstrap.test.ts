// `assertRuntimeConfig` is the boot guard that refuses to start a production
// process whose config would fail SILENTLY — OTPs logged to stdout, webhooks
// verified against an empty HMAC key, payment callbacks pointing at localhost.
// Every one of those keeps serving 200s while doing the wrong thing, so this
// guard is the only thing standing between a typo and a real incident. It is
// tested here at its contract: env in, throw-or-warn out.
//
// Contract under test (sysops):
//   * reads `process.env` LIVE on every call — no import-time capture, so a
//     test mutates env and calls the function directly;
//   * THROWS when NODE_ENV==="production", `console.warn`s everywhere else;
//   * message prefix: `[bootstrap] Invalid runtime config: `.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `bootstrap.ts` imports the mongo/redis/cron graph at module scope, and
// `databases/redis` constructs an ioredis client on import (`lazyConnect: false`)
// — importing it for real would open a live connection and leave a handle behind.
// `assertRuntimeConfig` touches none of them, so the graph is stubbed out.
vi.mock("@/server/databases", () => ({
	connectMongoDB: vi.fn(),
	disconnectMongoDB: vi.fn(),
}));
vi.mock("@/server/databases/redis", () => ({ disconnectRedis: vi.fn() }));
vi.mock("@/server/constants/cron", () => ({ default: vi.fn() }));

import {
	E2E_OTP_SINK_TOKEN,
	E2E_OTP_SINK_VAR,
	evaluateOtpSinkHatch,
} from "@/server/constants/environments";
import { assertRuntimeConfig } from "@/server/runtime/bootstrap";

const PREFIX = "[bootstrap] Invalid runtime config: ";

/**
 * A production env that the guard accepts. Every failure test below starts from
 * this and breaks exactly ONE variable, so a throw can only be attributed to
 * that variable. The "baseline does not throw" test is what makes that
 * attribution honest — without it, these tests could all be passing for the
 * wrong reason.
 */
function setValidProdEnv(): void {
	vi.stubEnv("NODE_ENV", "production");
	vi.stubEnv(
		"JWT_ACCESS_TOKEN_SECRET",
		"prod-access-secret-0123456789-0123456789-abcdef",
	);
	vi.stubEnv(
		"JWT_REFRESH_TOKEN_SECRET",
		"prod-refresh-secret-9876543210-9876543210-fedcba",
	);
	vi.stubEnv(
		"ENCRYPTION_KEY",
		"00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
	);
	vi.stubEnv("OTP_PROVIDER", "termii");
	vi.stubEnv("TERMII_API_KEY", "prod-fake-termii-key-not-real");
	vi.stubEnv("TERMII_SENDER_ID", "PreChop");
	vi.stubEnv("PAYSTACK_SECRET_KEY", "prod-fake-paystack-not-real");
	vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://prechop.ng");
	vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:27019");
	vi.stubEnv("REDIS_URI", "redis://127.0.0.1:6379");
	vi.stubEnv("TRUSTED_PROXY", "1");
	// The hatch is opt-in: baseline production is explicitly WITHOUT it, so no
	// test below can pass because of a hatch leaking in from the ambient env.
	vi.stubEnv(E2E_OTP_SINK_VAR, undefined);
	// Absent is valid for the fee vars — the documented default applies.
	vi.stubEnv("PLATFORM_FEE_VENDOR_PERCENT", undefined);
	vi.stubEnv("PLATFORM_FEE_BUYER_PERCENT", undefined);
	vi.stubEnv("PLATFORM_FEE_BUYER_MAX_KOBO", undefined);
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	// Restores NODE_ENV="test" and every other var set by tests/setup.ts, so a
	// leaked NODE_ENV="production" can never bleed into another file.
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("assertRuntimeConfig — baseline", () => {
	it("accepts a fully-configured production env", () => {
		setValidProdEnv();
		expect(() => assertRuntimeConfig()).not.toThrow();
	});

	it("reads process.env live on every call, not at import time", () => {
		setValidProdEnv();
		expect(() => assertRuntimeConfig()).not.toThrow();

		// Same module instance, same function reference — only env changed.
		// If the module had captured env at import, this would still pass.
		vi.stubEnv("OTP_PROVIDER", "console");
		expect(() => assertRuntimeConfig()).toThrow(/OTP_PROVIDER=console/);

		vi.stubEnv("OTP_PROVIDER", "termii");
		expect(() => assertRuntimeConfig()).not.toThrow();
	});
});

describe("assertRuntimeConfig — OTP silent-failure guard in production", () => {
	it("throws when OTP_PROVIDER is unset (defaults to console)", () => {
		setValidProdEnv();
		vi.stubEnv("OTP_PROVIDER", undefined);
		expect(() => assertRuntimeConfig()).toThrow(/OTP_PROVIDER is unset/);
	});

	it("throws when OTP_PROVIDER=console — OTPs would go to stdout", () => {
		setValidProdEnv();
		vi.stubEnv("OTP_PROVIDER", "console");
		expect(() => assertRuntimeConfig()).toThrow(/OTP_PROVIDER=console/);
	});

	it("throws when OTP_PROVIDER=termii but Termii credentials are missing", () => {
		setValidProdEnv();
		vi.stubEnv("OTP_PROVIDER", "termii");
		vi.stubEnv("TERMII_API_KEY", undefined);
		vi.stubEnv("TERMII_SENDER_ID", undefined);
		expect(() => assertRuntimeConfig()).toThrow(
			/TERMII_API_KEY is missing/,
		);
		expect(() => assertRuntimeConfig()).toThrow(
			/TERMII_SENDER_ID is missing/,
		);
	});

	it("throws on a provider it cannot dispatch", () => {
		setValidProdEnv();
		vi.stubEnv("OTP_PROVIDER", "twilio");
		expect(() => assertRuntimeConfig()).toThrow(
			/OTP_PROVIDER="twilio" is not a known provider/,
		);
	});

	it("prefixes the failure message so boot failures are greppable", () => {
		setValidProdEnv();
		vi.stubEnv("OTP_PROVIDER", "console");
		// Pin the PREFIX (the contract ops greps for) and the offending var —
		// deliberately not the prose after it, which is guidance and may be
		// reworded without any behaviour changing.
		let caught: unknown;
		try {
			assertRuntimeConfig();
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message.startsWith(PREFIX)).toBe(true);
		expect((caught as Error).message).toContain("OTP_PROVIDER=console");
	});
});

describe("assertRuntimeConfig — other production silent failures", () => {
	it("throws when PAYSTACK_SECRET_KEY is missing (forgeable webhooks)", () => {
		setValidProdEnv();
		vi.stubEnv("PAYSTACK_SECRET_KEY", undefined);
		expect(() => assertRuntimeConfig()).toThrow(
			/PAYSTACK_SECRET_KEY is missing/,
		);
	});

	it.each([
		"http://localhost:3000",
		"http://127.0.0.1:3000",
	])("throws when NEXT_PUBLIC_APP_URL points at %s", (url) => {
		setValidProdEnv();
		vi.stubEnv("NEXT_PUBLIC_APP_URL", url);
		expect(() => assertRuntimeConfig()).toThrow(/points at localhost/);
	});

	it("throws when NEXT_PUBLIC_APP_URL is unset", () => {
		setValidProdEnv();
		vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
		expect(() => assertRuntimeConfig()).toThrow(
			/NEXT_PUBLIC_APP_URL is unset/,
		);
	});

	it("throws when REDIS_URI is missing (ioredis silently uses localhost)", () => {
		setValidProdEnv();
		vi.stubEnv("REDIS_URI", undefined);
		expect(() => assertRuntimeConfig()).toThrow(/REDIS_URI is missing/);
	});

	it("throws when MONGODB_URI is missing", () => {
		setValidProdEnv();
		vi.stubEnv("MONGODB_URI", undefined);
		expect(() => assertRuntimeConfig()).toThrow(/MONGODB_URI is missing/);
	});

	it("reports every problem at once, not just the first", () => {
		setValidProdEnv();
		vi.stubEnv("OTP_PROVIDER", "console");
		vi.stubEnv("PAYSTACK_SECRET_KEY", undefined);
		// A boot guard that surfaces one problem per restart wastes a deploy
		// cycle per typo.
		expect(() => assertRuntimeConfig()).toThrow(/OTP_PROVIDER=console/);
		expect(() => assertRuntimeConfig()).toThrow(/PAYSTACK_SECRET_KEY/);
	});
});

describe("assertRuntimeConfig — secrets (enforced in every environment)", () => {
	it("throws in production when a JWT secret is too short", () => {
		setValidProdEnv();
		vi.stubEnv("JWT_ACCESS_TOKEN_SECRET", "too-short");
		expect(() => assertRuntimeConfig()).toThrow(
			/JWT_ACCESS_TOKEN_SECRET missing or shorter than 32 chars/,
		);
	});

	it("throws when both JWT secrets are identical", () => {
		setValidProdEnv();
		const same = "identical-secret-0123456789-0123456789-abcdef";
		vi.stubEnv("JWT_ACCESS_TOKEN_SECRET", same);
		vi.stubEnv("JWT_REFRESH_TOKEN_SECRET", same);
		// Reusing one secret for both lets a refresh token be replayed as an
		// access token.
		expect(() => assertRuntimeConfig()).toThrow(
			/JWT_ACCESS_TOKEN_SECRET and JWT_REFRESH_TOKEN_SECRET must differ/,
		);
	});

	it("throws when ENCRYPTION_KEY is short of an AES-256 key", () => {
		setValidProdEnv();
		vi.stubEnv("ENCRYPTION_KEY", "00112233445566778899aabbccddeeff");
		expect(() => assertRuntimeConfig()).toThrow(
			/ENCRYPTION_KEY missing or shorter than 64 chars/,
		);
	});
});

describe("assertRuntimeConfig — fee parsing is money, checked in all envs", () => {
	// These run with NODE_ENV="test" (from tests/setup.ts) on purpose: a
	// malformed fee var must be caught everywhere, not only in production.
	it.each([
		["PLATFORM_FEE_BUYER_PERCENT", "", /is set but empty/],
		["PLATFORM_FEE_VENDOR_PERCENT", "   ", /is set but empty/],
		["PLATFORM_FEE_BUYER_PERCENT", "8%", /is not a finite number/],
		["PLATFORM_FEE_VENDOR_PERCENT", "abc", /is not a finite number/],
		["PLATFORM_FEE_BUYER_PERCENT", "-1", /is negative/],
		["PLATFORM_FEE_VENDOR_PERCENT", "101", /exceeds the sane maximum/],
	])("warns outside production on %s=%j", (name, value, expected) => {
		vi.stubEnv(name, value);
		expect(() => assertRuntimeConfig()).not.toThrow();
		expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(expected));
	});

	it("throws in production on a malformed fee var", () => {
		setValidProdEnv();
		// `Number("")` is 0 — this exact typo would silently zero the buyer fee
		// and charge nobody, with no error anywhere.
		vi.stubEnv("PLATFORM_FEE_BUYER_PERCENT", "");
		expect(() => assertRuntimeConfig()).toThrow(
			/PLATFORM_FEE_BUYER_PERCENT is set but empty/,
		);
	});

	it("accepts absent fee vars — the documented default applies", () => {
		setValidProdEnv();
		expect(() => assertRuntimeConfig()).not.toThrow();
	});

	it("accepts a fee var of 0 — a deliberate zero is not a typo", () => {
		setValidProdEnv();
		vi.stubEnv("PLATFORM_FEE_BUYER_PERCENT", "0");
		expect(() => assertRuntimeConfig()).not.toThrow();
	});
});

describe("assertRuntimeConfig — non-production degrades to a warning", () => {
	it("warns instead of throwing when NODE_ENV is not production", () => {
		// Same config that throws above; only NODE_ENV differs.
		vi.stubEnv("NODE_ENV", "development");
		vi.stubEnv("JWT_ACCESS_TOKEN_SECRET", "too-short");

		expect(() => assertRuntimeConfig()).not.toThrow();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				`${PREFIX}JWT_ACCESS_TOKEN_SECRET missing or shorter than 32 chars`,
			),
		);
	});

	it("does not apply the production-only silent-failure checks in dev", () => {
		vi.stubEnv("NODE_ENV", "development");
		vi.stubEnv("OTP_PROVIDER", "console");
		vi.stubEnv("PAYSTACK_SECRET_KEY", undefined);
		vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);

		// `console` OTP is the whole point of local dev — it must stay silent.
		assertRuntimeConfig();
		expect(warnSpy).not.toHaveBeenCalledWith(
			expect.stringContaining("OTP_PROVIDER"),
		);
	});

	it("stays silent when a non-production env is fully valid", () => {
		assertRuntimeConfig();
		expect(warnSpy).not.toHaveBeenCalled();
	});
});

describe("assertRuntimeConfig — production warnings (non-fatal)", () => {
	it("warns but does not throw when TRUSTED_PROXY is not 1", () => {
		setValidProdEnv();
		vi.stubEnv("TRUSTED_PROXY", "0");
		expect(() => assertRuntimeConfig()).not.toThrow();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("TRUSTED_PROXY is not set"),
		);
	});

	it("warns that METRICS_ENABLED=1 is ignored in production", () => {
		setValidProdEnv();
		vi.stubEnv("METRICS_ENABLED", "1");
		expect(() => assertRuntimeConfig()).not.toThrow();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				"METRICS_ENABLED=1 is ignored in production",
			),
		);
	});
});

describe("E2E OTP sink hatch — the only way console OTP may boot in production", () => {
	// The hatch exists so Playwright can drive `next start` without sending SMS.
	// Its failure mode is catastrophic in BOTH directions: too strict and e2e is
	// dead; too loose and a real deployment silently stops sending OTPs. These
	// tests exist to keep it exactly as narrow as it claims to be.

	function requestHatch(value: string = E2E_OTP_SINK_TOKEN): void {
		vi.stubEnv(E2E_OTP_SINK_VAR, value);
		vi.stubEnv("OTP_PROVIDER", "console");
	}

	it("engages with the exact token and explicit OTP_PROVIDER=console", () => {
		setValidProdEnv();
		requestHatch();
		expect(() => assertRuntimeConfig()).not.toThrow();
		expect(evaluateOtpSinkHatch()).toEqual({
			requested: true,
			engaged: true,
			refusals: [],
		});
	});

	it("is NOT engaged when unrequested — the guard's default is unchanged", () => {
		setValidProdEnv();
		expect(evaluateOtpSinkHatch()).toEqual({
			requested: false,
			engaged: false,
			refusals: [],
		});
		// Absent the hatch, production console OTP is still fatal. This is the
		// assertion that proves the hatch did not weaken the production guard.
		vi.stubEnv("OTP_PROVIDER", "console");
		expect(() => assertRuntimeConfig()).toThrow(/OTP_PROVIDER=console/);
	});

	it.each([
		["1", "a truthy value"],
		["true", "the string true"],
		["yes", "an affirmative"],
		[`${E2E_OTP_SINK_TOKEN}x`, "a superstring of the token"],
		[E2E_OTP_SINK_TOKEN.slice(0, -1), "a prefix of the token"],
		[E2E_OTP_SINK_TOKEN.toUpperCase(), "the token in the wrong case"],
	])("refuses %j (%s) — and that refusal is fatal in production", (value) => {
		setValidProdEnv();
		requestHatch(value);
		const status = evaluateOtpSinkHatch();
		expect(status.requested).toBe(true);
		expect(status.engaged).toBe(false);
		// A half-set hatch must not fail OPEN into "console OTP is fine".
		expect(() => assertRuntimeConfig()).toThrow(
			/not to the exact opt-in token/,
		);
	});

	it("refuses when OTP_PROVIDER merely defaults to console rather than saying so", () => {
		setValidProdEnv();
		vi.stubEnv(E2E_OTP_SINK_VAR, E2E_OTP_SINK_TOKEN);
		vi.stubEnv("OTP_PROVIDER", undefined);
		// An unset provider *defaults* to console; a default must never be
		// enough to disable SMS.
		const status = evaluateOtpSinkHatch();
		expect(status.engaged).toBe(false);
		expect(status.refusals.join(" ")).toMatch(/not explicitly "console"/);
		expect(() => assertRuntimeConfig()).toThrow(/OTP_PROVIDER is unset/);
	});

	it("refuses a process holding a LIVE Paystack key, token notwithstanding", () => {
		setValidProdEnv();
		requestHatch();
		vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_realkeymaterial");
		// The real threat: the token leaks into a production env block via
		// copy-paste. Live credentials prove this is not an e2e harness.
		expect(evaluateOtpSinkHatch().engaged).toBe(false);
		expect(() => assertRuntimeConfig()).toThrow(/is a LIVE key/);
	});

	it("refuses a process holding a LIVE Sendchamp key", () => {
		setValidProdEnv();
		requestHatch();
		vi.stubEnv("SENDCHAMP_API_KEY", "sc_live_realkeymaterial");
		expect(evaluateOtpSinkHatch().engaged).toBe(false);
		expect(() => assertRuntimeConfig()).toThrow(/LIVE Sendchamp key/);
	});

	it("reads env live, so one process cannot cache an engaged hatch", () => {
		setValidProdEnv();
		requestHatch();
		expect(evaluateOtpSinkHatch().engaged).toBe(true);
		vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_realkeymaterial");
		expect(evaluateOtpSinkHatch().engaged).toBe(false);
	});

	it("keeps bootstrap and environments in agreement — the one fatal disagreement", async () => {
		// If the boot guard permitted the sink but OTP_CONSOLE_MODE were false,
		// the process would boot and then attempt REAL sends. Assert both sides
		// agree under the same env.
		setValidProdEnv();
		requestHatch();
		expect(() => assertRuntimeConfig()).not.toThrow();

		vi.resetModules();
		const mod = await import("@/server/constants/environments");
		expect(mod.OTP_CONSOLE_MODE).toBe(true);
		vi.resetModules();
	});
});

describe("OTP_CONSOLE_MODE — derived at import time from IS_PROD", () => {
	// This constant is a module-level `const`, evaluated once when
	// `environments.ts` is first imported. `vi.resetModules()` + a dynamic
	// import is the only way to observe it under a different NODE_ENV; without
	// the reset, every case here would read the value baked in by tests/setup.ts.
	afterEach(() => {
		vi.resetModules();
	});

	async function loadOtpConsoleMode(): Promise<boolean> {
		vi.resetModules();
		const mod = await import("@/server/constants/environments");
		return mod.OTP_CONSOLE_MODE;
	}

	it("is false in production even when OTP_PROVIDER=console", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("OTP_PROVIDER", "console");
		// The belt-and-braces guard: no combination of env vars may route
		// production OTPs to stdout, even if the boot assert were bypassed.
		expect(await loadOtpConsoleMode()).toBe(false);
	});

	it("is false in production for every provider value", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("OTP_PROVIDER", "termii");
		expect(await loadOtpConsoleMode()).toBe(false);
	});

	it("is true in development with OTP_PROVIDER=console", async () => {
		vi.stubEnv("NODE_ENV", "development");
		vi.stubEnv("OTP_PROVIDER", "console");
		expect(await loadOtpConsoleMode()).toBe(true);
	});

	it("is true when OTP_PROVIDER is unset outside production (defaults to console)", async () => {
		vi.stubEnv("NODE_ENV", "development");
		vi.stubEnv("OTP_PROVIDER", undefined);
		expect(await loadOtpConsoleMode()).toBe(true);
	});

	it("is false outside production when a real provider is configured", async () => {
		vi.stubEnv("NODE_ENV", "development");
		vi.stubEnv("OTP_PROVIDER", "termii");
		expect(await loadOtpConsoleMode()).toBe(false);
	});
});
