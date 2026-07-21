# 06 — Configuration Reference

Configuration lives in two places:

1. **Environment variables** — infrastructure & secrets, validated at boot, immutable at runtime.
2. **`siteConfigs`** — a single-document MongoDB collection for **runtime-tunable policy**
   (fees, feature flags, kill switches), changeable without a redeploy. This is the gkoi pattern.

The rule: if a value is a secret or an endpoint, it is an **env var**. If it is a business policy
an admin might want to change, it is a **`siteConfigs`** field.

---

## 1. Environment variables

Read through `src/server/constants/environments.ts` with `?? <default>` fallbacks, and asserted
in `bootstrap.ts` (`assertRuntimeConfig()`). `NEXT_PUBLIC_*` vars are exposed to the client;
everything else is server-only.

### 1.1 Production-required — the app **refuses to boot** without these

`assertRuntimeConfig()` **throws in production** (warns elsewhere) for each of the following. This
is deploy-gating: a container missing any of these will fail to start rather than serve traffic in a
silently wrong state.

| Variable | Why boot fails without it |
|---|---|
| `JWT_ACCESS_TOKEN_SECRET` | missing, `<32` chars, or equal to the refresh secret |
| `JWT_REFRESH_TOKEN_SECRET` | missing, `<32` chars, or equal to the access secret |
| `ENCRYPTION_KEY` | missing or `<64` chars |
| `OTP_PROVIDER` | **unset or `console`**, or not one of `console` \| `sendchamp` — see the warning below |
| `SENDCHAMP_API_KEY` | required when `OTP_PROVIDER=sendchamp`; every OTP send would fail |
| `PAYSTACK_SECRET_KEY` | webhook signatures would be HMAC'd against an **empty (publicly known) key**, letting anyone forge a "payment succeeded" webhook |
| `NEXT_PUBLIC_APP_URL` | unset **or pointing at localhost** — it is baked into Paystack callback URLs and receipt links, so real buyers land on a dead host after paying |
| `MONGODB_URI` | missing |
| `REDIS_URI` | missing — ioredis would silently fall back to `127.0.0.1:6379` |

> **⚠️ `OTP_PROVIDER` was a silent-failure trap and is now boot-gated.** It defaults to `console`,
> which **logs every OTP to stdout instead of sending an SMS — while the API still reports "OTP sent
> successfully"**. Nobody could log in and nothing errored. Production now refuses to boot unless
> `OTP_PROVIDER=sendchamp` (the only other known value). **Operators upgrading must set
> `OTP_PROVIDER` and `NEXT_PUBLIC_APP_URL` explicitly** — a deploy that previously "worked" on
> defaults will now fail to start.

**Fee vars are validated in every environment** (not just production): a set-but-malformed value is
worse than an absent one, because `Number("")` is `0` and `Number("8%")` is `NaN` — a typo would
silently zero or `NaN` real money instead of crashing. Absence is fine; the documented default applies.

**Warned, not fatal (production):** `METRICS_ENABLED=1` (ignored — `/api/metrics` always requires
`METRICS_TOKEN` in prod) · `TRUSTED_PROXY` unset (forwarded-IP headers are client-supplied, so rate
limits and IP binding can be spoofed).

### Core
| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | yes | `development` / `production` / `test` |
| `NEXT_PUBLIC_APP_URL` | **prod: boot-gated** | public origin (CORS, Paystack callbacks, receipt links). Must not be localhost in prod |
| `PORT` | no | defaults 3000 |

### Platform fees
These are the **fallback** policy. The live policy is whatever an admin has set in `siteConfigs`
(§2); these are what a missing/invalid config resolves to, so a config problem can never charge 0%.
Validated at boot in **every** environment.

| Variable | Required | Description |
|---|---|---|
| `PLATFORM_FEE_BUYER_PERCENT` | no | default `3` — buyer service fee, % of food subtotal |
| `PLATFORM_FEE_BUYER_MAX_KOBO` | no | default `20000` (₦200) — cap on the buyer service fee |
| `PLATFORM_FEE_VENDOR_PERCENT` | no | default `8` — vendor commission, % of food subtotal (uncapped) |

### Database & cache
| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | yes | Mongo connection string (replica set in prod) |
| `DB_NAME` | yes | database name (also namespaces Redis keys) |
| `REDIS_URI` | yes | Redis connection string (TLS in prod) |

### Auth
| Variable | Required | Description |
|---|---|---|
| `JWT_ACCESS_TOKEN_SECRET` | yes | HS256 access secret, ≥32 chars |
| `JWT_REFRESH_TOKEN_SECRET` | yes | HS256 refresh secret, ≥32 chars, **must differ** from access |
| `ACCESS_TOKEN_MAX_AGE` | no | default `15m` |
| `REFRESH_TOKEN_MAX_AGE` | no | default `30d` |
| `COOKIE_DOMAIN` | prod | used for `__Host-`/host-only cookie policy |
| `ENCRYPTION_KEY` | yes | 32-byte hex (64 chars) for AES-256-GCM PII encryption (phone, bank account) |

> The old `prechop-api` used RSA (`JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`). Those are **removed** —
> a single app uses symmetric HS256 with two distinct secrets. See ADR-003.

### Storage (S3)
| Variable | Required | Description |
|---|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | yes | IAM credentials |
| `AWS_REGION` | yes | e.g. `af-south-1` |
| `AWS_S3_BUCKET_NAME` | yes | images + private receipts |

### Payments (Paystack)
| Variable | Required | Description |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | yes | `sk_test_` / `sk_live_` |
| `PAYSTACK_PUBLIC_KEY` | yes | client init |

### Comms
| Variable | Required | Description |
|---|---|---|
| `SENDCHAMP_API_KEY` | yes | SMS/OTP (live provider) |
| `SENDCHAMP_SENDER_ID` | yes | approved sender ID, e.g. `PreChop` |
| `RESEND_API_KEY` | yes | transactional email |
| `RESEND_FROM_EMAIL` | yes | verified sender |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | yes (for push) | web-push |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | yes (for push) | client subscribe |

### Observability & ops
| Variable | Required | Description |
|---|---|---|
| `METRICS_ENABLED` | no | dev bypass for `/api/metrics` |
| `METRICS_TOKEN` | prod | bearer token guarding `/api/metrics` |
| `TRUSTED_PROXY` | prod | number of trusted proxy hops for client-IP resolution |
| `DISABLE_RATE_LIMIT` | no | `1` in e2e only |

### Seed
| Variable | Required | Description |
|---|---|---|
| `SEED_ADMIN_EMAIL` | no | phone for the seeded super-admin (default `prechopofficial@gmail.com
`) |

---

## 2. `siteConfigs` (runtime policy)

A single document, read on the hot path via a lean+projected query with an env-constant fallback
and a short (~10s) in-process cache (gkoi's `getAuditSettingsDB` pattern). Never build a bespoke
settings store — extend this document.

```ts
interface ISiteConfigs {
  // fees — the LIVE pricing policy, read by placeOrder via resolveFeePolicy().
  // Percent of the FOOD SUBTOTAL, not a flat amount. Defaults are env-sourced.
  platformFeeBuyerPercent: number;   // default 3     (PLATFORM_FEE_BUYER_PERCENT)
  platformFeeBuyerMaxKobo: number;   // default 20000 (₦200 cap)
  platformFeeVendorPercent: number;  // default 8     (uncapped)

  // ⚠️ RETIRED — do not add new reads. Gone from the schema, defaults and
  // validator. Declared @deprecated only so out-of-slice readers compile.
  platformFeeBuyerKobo?: number;
  platformFeeVendorKobo?: number;

  // order policy
  slotHoldTtlSeconds: number;      // default 600  (10 min pending-payment hold)
  abandonedOrderMinutes: number;   // default 15   (auto-cancel threshold)
  externalPaymentLinkTtlMinutes: number; // default 1440 (24h "Pay for Me" link)
  reviewWindowHours: number;       // default 72   (review must be left within)
  cutoffWarningMinutes: number;    // default 30   (pre-cutoff notice)

  // feature flags
  whatsappTvEnabled: boolean;      // Phase 1 directory on/off
  marketplaceEnabled: boolean;     // campus feed on/off
  reviewsEnabled: boolean;

  // kill switches (monitor → enforce, gkoi rollout playbook)
  ordersKillSwitch: boolean;       // true = reject new orders (maintenance)
  paymentsKillSwitch: boolean;

  // vendor visibility
  profileCompletenessRequired: number; // default 100 — ⚠️ informational only, gates nothing
  updatedAt: Date;
  updatedBy: string;               // admin userId (audited)
}
```

> **⚠️ CORRECTED (2026-07-15) — the fee model here was wrong twice over.** This section previously
> claimed *"Platform fees moved here … canonical values are `5000` / `10000` kobo"* (ADR-004). Both
> halves were false: the fee is a **percentage**, not a flat amount, and the flat fields were **dead
> config** — default 0, editable in Admin → Settings, read by **nothing**, so an admin "changing the
> fee" silently did nothing. The flat fields are now **retired** and the **percent fields above are
> the real, live policy**, resolved by `resolveFeePolicy()` in `placeOrder`. See ADR-004a.

**Fee resolution — the money path.** `placeOrder` calls `resolveFeePolicy(config)`; the buyer's
pre-payment quote calls `getEffectiveFeePolicy()`, which reads the same config through the same
guard, so what a buyer is quoted cannot drift from what they are charged. If those ever diverge, it
is a bug in one of exactly two call sites.

**A config problem must never silently charge 0** — the failure mode here is not a crash but a silent
wrong charge:

| Config value | Result |
|---|---|
| absent / `undefined` / `null` | falls back **quietly** to the env default (simply not configured) |
| `""`, `"   "`, `"8%"`, `"three percent"`, `NaN`, `±Infinity`, negative, >100%, boolean, object, array | falls back to the env default **loudly** (`console.warn` naming the field) — a present-but-invalid value is someone's mistake to fix |
| a legacy doc with only the retired `platformFee*Kobo` fields | falls back to the standing percentages — a missed migration must not zero the fee |
| explicit, valid `0` | **honoured, no warning** — a promo is not a typo |
| `"4.5"` (numeric string) | accepted — Mongo and form posts both produce them |

Percentages apply at **basis-point** resolution (two decimals of a percent), then round to whole
kobo — there is no sub-kobo denomination. Bounds: percent `[0, 100]`, cap `[0, 100_000_000]` (₦1m).

Notes:
- Reads fail **safe**: on any error the query returns the env-constant fallback, never throws.
- Every write is audited (previous/new state) via the admin audit stream.
- `profileCompletenessRequired` (default 100) is **informational only** — vendor go-live is gated on
  **admin approval**, not on a completeness score. See PRD §6 / BR-15–16.
- `siteConfigs` also governs: order policy (slot hold TTL, abandoned-order window, external payment
  link TTL, review window, cutoff warning), feature flags (`whatsappTvEnabled`, `marketplaceEnabled`,
  `reviewsEnabled`) and the kill switches (`ordersKillSwitch`, `paymentsKillSwitch`, both checked in
  `placeOrder`).

---

## 3. Configuration precedence

```
siteConfigs (if the field is present AND valid) ► env constant fallback ► hard-coded default
```

Note the **`AND valid`** — for fees this is load-bearing, not pedantry. A field that is *present but
garbage* (`""`, `"8%"`, `null`, negative) does **not** win precedence; it falls back loudly. Trusting
"present" alone is exactly how `Number("")` silently charges every buyer ₦0.

For a request on the hot path, resolve policy from the cached `siteConfigs`; if the collection or
field is missing, fall back to the env constant, then the code default. This guarantees the app
runs even before `siteConfigs` is seeded.
