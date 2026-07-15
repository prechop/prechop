// Redis key derivation for the e2e OTP login shortcut.
//
// THE BUG THIS EXISTS TO KILL: every spec used to build its own keys from the
// RAW seeded phone —
//
//     await redis.del(`otp:ratelimit:${phone}`);            // "08122222222"
//     await redis.setex(`otp:code:${phone}`, ...);
//
// but `requestOtp` normalises first and keys off the E.164 form, so the server
// actually reads and writes `otp:ratelimit:+2348122222222`. The two never met.
// Consequences, both observed on the shared Redis:
//
//   * the rate-limit `del` cleared a key that never existed, so the real
//     counter accumulated across runs. After OTP_MAX_ATTEMPTS (3) requests per
//     phone the suite 429s — "Too many OTP attempts. Try again in 30 minutes."
//     — and STAYS broken for 30 minutes. That is a test suite that gets more
//     broken the more you run it.
//   * the known OTP hash landed on a key the server never reads, so verify
//     compared against the server's own random code and failed.
//
// Both are fixed by deriving keys through the SAME normaliser the server uses.
// Importing it (rather than re-implementing `+234…` here) is the point: if
// normalisation ever changes, these keys change with it and cannot drift again.
// `constants/phone` is a pure module — no `server-only`, no datastore import —
// so pulling it into the Playwright process is safe.

import { normalizeNigerianMobilePhone } from "../src/server/constants/phone";

/** The E.164 phone the server keys Redis by. Throws on a number the app would reject. */
export function normalizedPhone(phone: string): string {
	const normalized = normalizeNigerianMobilePhone(phone);
	if (!normalized) {
		throw new Error(
			`[e2e] "${phone}" is not a valid Nigerian mobile number — the server would reject it, so no OTP key exists for it.`,
		);
	}
	return normalized;
}

export function otpCodeKey(phone: string): string {
	return `otp:code:${normalizedPhone(phone)}`;
}

export function otpRateLimitKey(phone: string): string {
	return `otp:ratelimit:${normalizedPhone(phone)}`;
}

export function otpVerifyRateLimitKey(phone: string): string {
	return `otp:verify:ratelimit:${normalizedPhone(phone)}`;
}

/**
 * Clear every per-phone OTP gate before a login shortcut.
 *
 * Both counters matter: `otp:ratelimit` gates *requesting* a code and
 * `otp:verify:ratelimit` gates *verifying* one. Clearing only the first (what
 * the specs did) still lets the verify counter accumulate across runs.
 *
 * Redis is shared and NOT namespaced by DB_NAME, so this state outlives the
 * fixture database — dropping the DB does not reset it. It must be cleared
 * explicitly.
 */
export async function clearOtpGates(
	redis: { del: (...keys: string[]) => Promise<number> },
	phone: string,
): Promise<void> {
	await redis.del(
		otpRateLimitKey(phone),
		otpVerifyRateLimitKey(phone),
		otpCodeKey(phone),
	);
}
