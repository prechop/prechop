// The single env block shared by the e2e web server AND the seed that populates
// its database. Both MUST agree, and this file is what makes that true.
//
// WHY: user phone numbers are encrypted at rest with ENCRYPTION_KEY, and login
// finds a user by that encrypted value. The seed used to run with `--env-file=.env`
// (the developer's REAL key) while Playwright's webServer was handed a different
// hardcoded one. Every seeded phone was then unfindable: OTP login fell through
// to auto-registration and silently created a brand-new *buyer* named "Guest"
// instead of logging in as the seeded admin. The admin IAM specs then failed with
// `groups: ["Buyers"]` — a failure whose cause is nowhere near its symptom.
//
// Keeping the values here (not in `.env`) also means an e2e run never loads, and
// can never leak, a real secret.

import {
	E2E_OTP_SINK_TOKEN,
	E2E_OTP_SINK_VAR,
} from "../src/server/constants/environments";

/** Throwaway secrets — obviously fake, valid only for e2e. */
export const E2E_APP_ENV: Record<string, string> = {
	// Long enough for the boot guard (>=32), and distinct from each other.
	JWT_ACCESS_TOKEN_SECRET: "e2e-access-secret-0123456789-0123456789-abcdef",
	JWT_REFRESH_TOKEN_SECRET: "e2e-refresh-secret-9876543210-9876543210-fedcba",
	// 32-byte hex for AES-256-GCM. The seed encrypts phones with this exact key,
	// so the server can decrypt/match them.
	ENCRYPTION_KEY:
		"00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",

	// ── OTP: log, never send ────────────────────────────────────────────────
	// `next start` boots NODE_ENV=production, where OTP_PROVIDER=console is
	// fatal by design (it would let a real deploy silently log OTPs instead of
	// sending SMS). OTP_PROVIDER=sendchamp would put REAL SMS on REAL phones.
	// sysops' hatch is the sanctioned third door: an exact opt-in token that
	// engages only when nothing about the process looks like production. It does
	// not weaken the guard — with the token absent, production console OTP is
	// still fatal (asserted in tests/runtime/bootstrap.test.ts).
	OTP_PROVIDER: "console",
	[E2E_OTP_SINK_VAR]: E2E_OTP_SINK_TOKEN,
	// The hatch REFUSES to engage beside a live credential. These are fake so
	// that (a) it engages, and (b) if it ever failed to, no real SMS could be
	// sent anyway. Defence in depth.
	SENDCHAMP_API_KEY: "e2e-fake-sendchamp-not-real",
	PAYSTACK_SECRET_KEY: "e2e-fake-paystack-not-real",

	// Must not be localhost/127.0.0.1 or the boot guard rejects it — it is baked
	// into payment callbacks. e2e never completes a real Paystack round-trip.
	// NOTE: this is NOT the CSRF allow-list; that is `clientAppURLs`, which
	// already trusts `localhost`, so specs send `origin: http://localhost:3100`.
	NEXT_PUBLIC_APP_URL: "https://prechop.ng",
	TRUSTED_PROXY: "1",
	DISABLE_RATE_LIMIT: "1",

	// Pinned so the seeded admin always matches the phone the specs log in as,
	// whatever `.env` happens to say.
	SEED_ADMIN_PHONE: "08130135756",
};
