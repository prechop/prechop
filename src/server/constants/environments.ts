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
export const OTP_PROVIDER = process.env.OTP_PROVIDER ?? "console";
export const SENDCHAMP_API_KEY = process.env.SENDCHAMP_API_KEY ?? "";
export const SENDCHAMP_TIMEOUT_MS = Number(
	process.env.SENDCHAMP_TIMEOUT_MS ?? 30_000,
);

/**
 * The ONLY opt-in that lets a `NODE_ENV=production` process route OTPs to
 * stdout instead of SMS. It exists for exactly one caller: an e2e harness run
 * under `next start`, which forces production mode and therefore cannot use the
 * dev console sink.
 *
 * Name and token are deliberately long, ugly and self-incriminating. That is
 * the design, not an accident:
 *   - The token must match EXACTLY. `1`/`true`/`yes` do nothing. A hatch that
 *     accepts any truthy value is a hatch that a stray `=1` can trip.
 *   - Absence, emptiness and whitespace are all "not requested". The hatch is
 *     never inferred from a missing or defaulted variable — that WAS the
 *     original bug: `OTP_PROVIDER` *defaulting* to `console` silently disabled
 *     SMS while the API still reported success. This must not be that trap in
 *     a new costume.
 */
export const E2E_OTP_SINK_VAR = "PRECHOP_UNSAFE_E2E_OTP_CONSOLE_SINK";
export const E2E_OTP_SINK_TOKEN = "i-am-an-e2e-harness-do-not-send-real-sms";

export type OtpSinkHatchStatus = {
	/** The var is present and non-empty — someone asked for the hatch. */
	requested: boolean;
	/** The hatch is actually in force. Implies `requested`. */
	engaged: boolean;
	/** Why a requested hatch was refused. Non-empty iff requested && !engaged. */
	refusals: string[];
};

/**
 * Decide whether the console-sink hatch is in force, reading `process.env`
 * LIVE on every call so `bootstrap.ts` can be exercised by mutating env.
 *
 * A single correct token is not enough to engage. The hatch also refuses on any
 * signal that this is a genuine production process, because the failure mode we
 * are guarding against is not "someone types the token" — it is "the token
 * leaks into a real deployment via a copy-pasted CI env block". Corroborating
 * signals are read from runtime-evaluated vars only; `NEXT_PUBLIC_*` is inlined
 * by Next at BUILD time and so cannot describe the running environment.
 */
export function evaluateOtpSinkHatch(): OtpSinkHatchStatus {
	const raw = process.env[E2E_OTP_SINK_VAR]?.trim();
	if (!raw) return { requested: false, engaged: false, refusals: [] };

	const refusals: string[] = [];
	if (raw !== E2E_OTP_SINK_TOKEN) {
		refusals.push(
			`${E2E_OTP_SINK_VAR} is set but not to the exact opt-in token — the hatch never engages on a truthy or partial value. Set it to "${E2E_OTP_SINK_TOKEN}" or unset it`,
		);
	}
	// Must be asked for explicitly. An unset OTP_PROVIDER *defaults* to console,
	// and a default must never be sufficient to disable SMS.
	if (process.env.OTP_PROVIDER !== "console") {
		refusals.push(
			`${E2E_OTP_SINK_VAR} is set but OTP_PROVIDER is not explicitly "console" (got ${process.env.OTP_PROVIDER === undefined ? "unset" : `"${process.env.OTP_PROVIDER}"`}) — the sink is never inferred from a defaulted provider`,
		);
	}
	// Production tells: a process holding live third-party credentials is not an
	// e2e harness, whatever its env vars claim.
	if (/^sk_live_/i.test(process.env.PAYSTACK_SECRET_KEY ?? "")) {
		refusals.push(
			`${E2E_OTP_SINK_VAR} is set but PAYSTACK_SECRET_KEY is a LIVE key (sk_live_…) — this is a real production process and the OTP sink will not engage`,
		);
	}
	if (/_live_/i.test(process.env.SENDCHAMP_API_KEY ?? "")) {
		refusals.push(
			`${E2E_OTP_SINK_VAR} is set but SENDCHAMP_API_KEY is a LIVE Sendchamp key — an e2e process must not hold a credential that can send real SMS. Override it with an obviously fake value`,
		);
	}
	return { requested: true, engaged: refusals.length === 0, refusals };
}

/**
 * The console OTP sink prints the code instead of paying for an SMS. It is
 * DEV-ONLY, plus the one deliberate exception above.
 *
 * It is derived from `IS_PROD` — not from `OTP_PROVIDER` alone — so that no
 * accidental combination of env vars can route production OTPs to stdout. In
 * production it additionally requires the explicit `E2E_OTP_SINK_VAR` opt-in to
 * be present, exactly correct, and uncontradicted by any live-credential tell.
 *
 * `bootstrap.ts` refuses to start a production process whose OTP config would
 * land here without that opt-in, and evaluates the SAME `evaluateOtpSinkHatch`
 * so the two can never disagree. A boot that permits the sink and a runtime
 * that then attempts a real send (or vice versa) is the one outcome that would
 * put real SMS on real phones.
 */
export const OTP_CONSOLE_MODE =
	OTP_PROVIDER === "console" && (!IS_PROD || evaluateOtpSinkHatch().engaged);
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
