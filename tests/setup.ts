// Global test environment. Runs before every test file, in every worker.
//
// SAFETY: tests must never touch the dev database (`prechop`) or any remote
// store. Each vitest worker gets its own scratch database name so files can
// run in parallel without clobbering each other.

(process.env as Record<string, string>).NODE_ENV = "test";
process.env.MONGODB_URI =
	process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
process.env.REDIS_URI = process.env.REDIS_URI ?? "redis://127.0.0.1:6379";
// Include the pid: pool ids are only unique WITHIN one vitest process, so two
// concurrent `vitest run` invocations would otherwise share scratch DBs and
// race each other.
process.env.DB_NAME = `prechop-vitest-${process.pid}-${process.env.VITEST_POOL_ID ?? "0"}`;

process.env.JWT_ACCESS_TOKEN_SECRET =
	"vitest-access-secret-0123456789-0123456789-abcdef";
process.env.JWT_REFRESH_TOKEN_SECRET =
	"vitest-refresh-secret-9876543210-9876543210-fedcba";

// 32-byte hex key for AES-256-GCM PII encryption in tests.
process.env.ENCRYPTION_KEY =
	"00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

process.env.COOKIE_DOMAIN = "localhost";
process.env.DISABLE_RATE_LIMIT = process.env.DISABLE_RATE_LIMIT ?? "";
process.env.TRUSTED_PROXY = "0";
process.env.OTP_PROVIDER = "console";

// Payments / comms — obviously fake, nothing may perform a real network call.
// Deliberately NOT in `sk_test_...`/`pk_test_...` shape so secret scanners don't
// flag these placeholders; no code validates the key format (network is mocked).
process.env.PAYSTACK_SECRET_KEY = "test-paystack-secret-key-not-real";
process.env.PAYSTACK_PUBLIC_KEY = "test-paystack-public-key-not-real";
process.env.SENDCHAMP_API_KEY = "vitest-fake-sendchamp";
process.env.SENDCHAMP_SENDER_ID = "PreChop";
process.env.RESEND_API_KEY = "re_vitest_fake";
process.env.RESEND_FROM_EMAIL = "noreply@prechop.test";

// Keep S3 config obviously fake — helpers that presign URLs work offline.
process.env.AWS_REGION = "us-east-1";
process.env.AWS_S3_BUCKET_NAME = "vitest-fake-bucket";
process.env.AWS_ACCESS_KEY_ID = "test-aws-access-key-id-not-real";
process.env.AWS_SECRET_ACCESS_KEY = "vitest-fake-secret-key-not-real-000000000";

process.env.PLATFORM_FEE_VENDOR_PERCENT = "8";
process.env.PLATFORM_FEE_BUYER_PERCENT = "3";
process.env.PLATFORM_FEE_BUYER_MAX_KOBO = "20000";
