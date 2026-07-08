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
in `bootstrap.ts`. `NEXT_PUBLIC_*` vars are exposed to the client; everything else is server-only.

### Core
| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | yes | `development` / `production` / `test` |
| `NEXT_PUBLIC_APP_URL` | yes | public origin (CORS, callbacks, links) |
| `PORT` | no | defaults 3000 |

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
| `SEED_ADMIN_PHONE` | no | phone for the seeded super-admin (default `08000000000`) |

---

## 2. `siteConfigs` (runtime policy)

A single document, read on the hot path via a lean+projected query with an env-constant fallback
and a short (~10s) in-process cache (gkoi's `getAuditSettingsDB` pattern). Never build a bespoke
settings store — extend this document.

```ts
interface ISiteConfigs {
  // fees (kobo)
  platformFeeBuyerKobo: number;    // default 5000  (₦50)
  platformFeeVendorKobo: number;   // default 10000 (₦100)

  // order policy
  slotHoldTtlSeconds: number;      // default 600  (10 min pending-payment hold)
  abandonedOrderMinutes: number;   // default 15   (auto-cancel threshold)
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
  profileCompletenessRequired: number; // default 100

  updatedAt: Date;
  updatedBy: string;               // admin userId (audited)
}
```

Notes:
- **Platform fees moved here** to resolve the source discrepancy (env `50/100` vs DB `5000` vs
  PRD `₦50/₦100`). Canonical values are `5000` / `10000` kobo. See ADR-004.
- Reads fail **safe**: on any error the query returns the env-constant fallback, never throws.
- Every write is audited (previous/new state) via the admin audit stream.

---

## 3. Configuration precedence

```
siteConfigs (if the field exists) ► env constant fallback ► hard-coded default
```

For a request on the hot path, resolve policy from the cached `siteConfigs`; if the collection or
field is missing, fall back to the env constant, then the code default. This guarantees the app
runs even before `siteConfigs` is seeded.
