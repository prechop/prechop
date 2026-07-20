// Central env access. Every value is read once here with a `?? <default>`
// fallback; `bootstrap.ts` asserts the security-critical ones on boot. Nothing
// else in the codebase should read `process.env` directly.

export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const IS_PROD = NODE_ENV === "production";
export const PORT = process.env.PORT ?? "3000";
// Server-side origin for Paystack `callback_url`, receipt links and external
// payment links. Sourced from the RUNTIME `APP_URL` first: `NEXT_PUBLIC_*` is
// inlined by Next at BUILD time, so a `NEXT_PUBLIC_APP_URL`-only value is frozen
// to whatever the build machine had and cannot be corrected by a deploy-time
// env. Preferring `APP_URL` lets the running deployment set its own origin;
// `NEXT_PUBLIC_APP_URL` remains a fallback for the browser-inlined case.
export const APP_URL =
	process.env.APP_URL ??
	process.env.NEXT_PUBLIC_APP_URL ??
	"http://localhost:3000";
export const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN ?? "";

export const MAX_LIMIT = 50;

// Database & cache
export const MONGODB_URI = process.env.MONGODB_URI ?? "";
export const DB_NAME = process.env.DB_NAME ?? "prechop";
export const REDIS_URI = process.env.REDIS_URI ?? "";

// Auth
export const JWT_ACCESS_TOKEN_SECRET =
	process.env.JWT_ACCESS_TOKEN_SECRET ?? "";
export const JWT_REFRESH_TOKEN_SECRET =
	process.env.JWT_REFRESH_TOKEN_SECRET ?? "";
export const GOOGLE_OAUTH_CLIENT_ID =
	process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "";
export const GOOGLE_OAUTH_CLIENT_SECRET =
	process.env.GOOGLE_OAUTH_CLIENT_SECRET ??
	process.env.GOOGLE_CLIENT_SECRET ??
	"";

function parseDuration(value: string | undefined, fallbackSeconds: number) {
	if (!value) return fallbackSeconds;
	const match = value.match(/^(\d+)([smhd])$/);
	if (!match) return fallbackSeconds;
	const n = Number(match[1]);
	const unit = match[2];
	const mult =
		unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
	return n * mult;
}

export const ACCESS_TOKEN_MAX_AGE_SECONDS = parseDuration(
	process.env.ACCESS_TOKEN_MAX_AGE,
	15 * 60, // 15 minutes
);
export const REFRESH_TOKEN_MAX_AGE_SECONDS = parseDuration(
	process.env.REFRESH_TOKEN_MAX_AGE,
	60 * 60 * 24 * 30, // 30 days
);

// PII encryption
export const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "";

// Storage (S3)
export const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";
export const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME ?? "";
export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? "";
export const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? "";

// Payments (Paystack)
export const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY ?? "";
export const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY ?? "";

// Comms
export const SENDCHAMP_API_KEY = process.env.SENDCHAMP_API_KEY ?? "";
export const SENDCHAMP_TIMEOUT_MS = Number(
	process.env.SENDCHAMP_TIMEOUT_MS ?? 30_000,
);
export const SMS_CONSOLE_MODE = !IS_PROD;
export const SENDCHAMP_SENDER_ID = process.env.SENDCHAMP_SENDER_ID ?? "PreChop";
export const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
export const RESEND_FROM_EMAIL =
	process.env.RESEND_FROM_EMAIL ?? "noreply@prechop.ng";
// Web-push (VAPID)
export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
export const VAPID_SUBJECT =
	process.env.VAPID_SUBJECT ?? "mailto:support@prechop.ng";

// Platform fee percentages.
export const PLATFORM_FEE_VENDOR_PERCENT = Number(
	process.env.PLATFORM_FEE_VENDOR_PERCENT ?? 8,
);
export const PLATFORM_FEE_BUYER_PERCENT = Number(
	process.env.PLATFORM_FEE_BUYER_PERCENT ?? 3,
);
export const PLATFORM_FEE_BUYER_MAX_KOBO = Number(
	process.env.PLATFORM_FEE_BUYER_MAX_KOBO ?? 20_000,
);

// Observability & ops
export const METRICS_ENABLED = process.env.METRICS_ENABLED === "1";
export const METRICS_TOKEN = process.env.METRICS_TOKEN ?? "";
export const TRUSTED_PROXY = process.env.TRUSTED_PROXY === "1";

// Seed
export const SEED_ADMIN_PHONE = process.env.SEED_ADMIN_PHONE ?? "08000000000";
