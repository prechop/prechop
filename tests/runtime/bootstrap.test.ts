import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertRuntimeConfig } from "@/server/runtime/bootstrap";

const ACCESS_SECRET = "test-access-secret-12345678901234567890";
const REFRESH_SECRET = "test-refresh-secret-12345678901234567890";
const ENCRYPTION_KEY =
	"00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

function setBaseEnv() {
	vi.stubEnv("NODE_ENV", "production");
	vi.stubEnv("JWT_ACCESS_TOKEN_SECRET", ACCESS_SECRET);
	vi.stubEnv("JWT_REFRESH_TOKEN_SECRET", REFRESH_SECRET);
	vi.stubEnv("ENCRYPTION_KEY", ENCRYPTION_KEY);
	vi.stubEnv("APP_URL", "https://prechop.ng");
	vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
	vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:27019");
	vi.stubEnv("REDIS_URI", "redis://127.0.0.1:6379");
	vi.stubEnv("DISABLE_RATE_LIMIT", undefined);
	vi.stubEnv("PLATFORM_FEE_VENDOR_PERCENT", undefined);
	vi.stubEnv("PLATFORM_FEE_BUYER_PERCENT", undefined);
	vi.stubEnv("PLATFORM_FEE_BUYER_MAX_KOBO", undefined);
}

beforeEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	setBaseEnv();
});

describe("assertRuntimeConfig", () => {
	it("accepts a valid production runtime configuration", () => {
		expect(() => assertRuntimeConfig()).not.toThrow();
	});

	it("throws when required secrets are missing or too short", () => {
		vi.stubEnv("JWT_ACCESS_TOKEN_SECRET", "short");
		vi.stubEnv("ENCRYPTION_KEY", "also-short");

		expect(() => assertRuntimeConfig()).toThrow(
			/JWT_ACCESS_TOKEN_SECRET missing or shorter than 32 chars/,
		);
		expect(() => assertRuntimeConfig()).toThrow(
			/ENCRYPTION_KEY missing or shorter than 64 chars/,
		);
	});

	it("throws when access and refresh secrets are identical", () => {
		vi.stubEnv("JWT_REFRESH_TOKEN_SECRET", ACCESS_SECRET);

		expect(() => assertRuntimeConfig()).toThrow(
			/JWT_ACCESS_TOKEN_SECRET and JWT_REFRESH_TOKEN_SECRET must differ/,
		);
	});

	it("throws in production when app URL or datastores are missing", () => {
		vi.stubEnv("APP_URL", undefined);
		vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
		vi.stubEnv("MONGODB_URI", undefined);
		vi.stubEnv("REDIS_URI", undefined);

		expect(() => assertRuntimeConfig()).toThrow(/APP_URL is unset/);
		expect(() => assertRuntimeConfig()).toThrow(/MONGODB_URI is missing/);
		expect(() => assertRuntimeConfig()).toThrow(/REDIS_URI is missing/);
	});

	it("throws in production when localhost is used as the public app URL", () => {
		vi.stubEnv("APP_URL", "http://127.0.0.1:3000");

		expect(() => assertRuntimeConfig()).toThrow(/points at localhost/);
	});

	it("throws in production when rate limits are globally disabled", () => {
		vi.stubEnv("DISABLE_RATE_LIMIT", "true");

		expect(() => assertRuntimeConfig()).toThrow(
			/disables ALL rate limiting/,
		);
	});

	it("validates numeric fee environment variables in every environment", () => {
		vi.stubEnv("NODE_ENV", "test");
		vi.stubEnv("PLATFORM_FEE_VENDOR_PERCENT", "8%");
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(() => assertRuntimeConfig()).not.toThrow();
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("is not a finite number"),
		);
	});

	it("warns instead of throwing outside production for missing core secrets", () => {
		vi.stubEnv("NODE_ENV", "test");
		vi.stubEnv("JWT_ACCESS_TOKEN_SECRET", undefined);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(() => assertRuntimeConfig()).not.toThrow();
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("JWT_ACCESS_TOKEN_SECRET"),
		);
	});

	it("surfaces production warnings without failing valid config", () => {
		vi.stubEnv("METRICS_ENABLED", "1");
		vi.stubEnv("TRUSTED_PROXY", undefined);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(() => assertRuntimeConfig()).not.toThrow();
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("METRICS_ENABLED=1 is ignored"),
		);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("TRUSTED_PROXY is not set"),
		);
	});
});
