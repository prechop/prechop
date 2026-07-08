# 03 — Auth & Security

Identity in Prechop is a **phone number**. There are no passwords. Authentication is a
phone-OTP login that issues a short-lived JWT access token plus a rotating refresh token.

## 1. Login flow (phone + OTP)

```
1. POST /api/auth/register/buyer | /register/vendor | /otp/request
     → generate 6-digit OTP (crypto.randomInt)
     → bcrypt-hash it into Redis  otp:code:{phone}  (TTL 10 min, single-use)
     → send via Sendchamp SMS  (dev: console log)
     → rate limit: 3 requests / 30 min per phone  (otp:ratelimit:{phone})
     → response never reveals whether the account already existed

2. POST /api/auth/otp/verify  { phone, code }
     → bcrypt-compare against the Redis hash; delete on success (single-use)
     → mark phone verified (first time) / update lastLoginAt
     → issue access token (HS256, 15m) + refresh token (rotating)
     → set refresh cookie; return { accessToken, user }
```

## 2. Tokens

### Access token — HS256 JWT
- Signed with `JWT_ACCESS_TOKEN_SECRET`, **algorithm-pinned** on verify.
- Payload: `{ userId, role, campusId }`, `exp` 15m (`ACCESS_TOKEN_MAX_AGE`).
- Sent as `Authorization: Bearer` or the access cookie.
- **Changed from `prechop-api`:** was RS256 (asymmetric). A single app has no cross-service
  verification need, so symmetric HS256 with two distinct secrets is used (managerenta pattern,
  ADR-003).

### Refresh token — opaque, rotating
- 64-byte random hex; stored **SHA-256-hashed** (`tokenHash`), never in plaintext.
- Single-use: presenting a token consumes it and issues a new one atomically.
- **Reuse detection:** presenting an already-used token revokes **all** the user's tokens and
  throws `TOKEN_COMPROMISED` (stolen-token containment).
- 30-day lifetime; capped per user (trim oldest).
- Verification (`verifyAuthToken`): read access cookie/bearer → decode (pinned alg, manual `exp`
  backstop); if invalid, fall back to the refresh cookie and **atomically rotate** (single
  `findOneAndUpdate` with `$pull` of the old token → no double-redeem race).

### Cookies
- `httpOnly`, `secure` (prod), `sameSite: "strict"` (prod) / `"lax"` (dev).
- Prod names are **`__Host-`-prefixed** (`__Host-accessToken`, `__Host-refreshToken`) — host-only,
  no Domain attribute. Dev uses bare names (needs HTTPS for `__Host-`).
- Legacy names cleared on logout.

## 3. Edge gate — `proxy.ts`

Next 16 middleware guards **page shells** (not the API — the API enforces the real
authorization). Verifies the access-token signature with **`jose`** (edge-safe). Three states:
`authenticated` / `may-refresh` (refresh cookie present → allowed through for client bootstrap) /
`anonymous`. Redirects authed users off `/login|/signup`; redirects anon users off protected
routes to `/login?next=<path>` (path-only — no open redirect). Matcher excludes
`api|_next|favicon|manifest|robots`.

## 4. Authorization

Three checks, layered:
1. **Role** — `withAuth` provides `auth.role`; handlers/guards assert `BUYER`/`VENDOR`/`ADMIN`.
2. **Ownership** — services re-verify the resource belongs to the caller (`requireOwnedMenuItem`,
   vendor-owns-daily-order, buyer-owns-order). Client IDs are never trusted.
3. **Campus scope** — every tenant-scoped query filters on `auth.campusId` explicitly. Scoping is
   **not** a global magic filter; each `*DB` function includes `campusId` in its query. A
   `enforceCampusScope` guard asserts the value is present.

## 5. Rate limiting

Redis token bucket keyed `rate-limit:{DB_NAME}:{key}` (INCR + EXPIRE). `DISABLE_RATE_LIMIT=1` in
e2e only.

| Scope | Limit | Key |
|---|---|---|
| global default | 100 / min | userId ?? ip |
| OTP request | 3 / 10 min | phone (or ip) |
| OTP verify | 5 / 10 min | phone |
| order placement | 5 / 1 min | userId |
| webhook | 50 / 1 min | ip (Paystack-whitelisted) |

429 envelope carries `retryAfter`.

## 6. Payment security

- **Webhook HMAC-SHA512** verified against the raw body (timing-safe compare); bad signature → 401.
- **Idempotency:** `webhookVerified` flag + unique `idempotencyKey`; duplicate events return 200 no-op.
- **Amount verification:** webhook amount asserted against `payment.amountKobo` before marking paid.
- **Server-side pricing:** client sends only IDs + quantities + addon IDs; the server fetches all
  prices and computes totals.
- **Transactional state change:** order + items + payment persisted in one Mongo transaction (requires a replica set).

## 7. Data protection

- **PII encryption at rest** (AES-256-GCM, `ENCRYPTION_KEY`): `phone`, vendor `accountNumber`,
  `whatsappNumber`. Format `iv:authTag:ciphertext` hex.
- **Private S3** for receipts; presigned reads (1-year); images public-read via presigned PUT only.
- **Upload safety:** MIME allowlist (jpeg/png/webp) + size caps; direct-to-S3 so files never touch the app.
- **CSRF:** Origin/Referer allow-list on unsafe methods (via `withApiHandler`).
- **Audit:** append-only `auditLogs`; every state-changing admin/vendor action recorded with
  previous/new state, **server-resolved IP** (never client-trusted — gkoi rule), and user agent.
- **No secrets in logs**; `authorization`/`cookie` headers redacted.

## 8. The 7 security layers (defense in depth)

1. **Transport** — HTTPS only, CDN/DDoS buffer, security headers/CSP (enable in `next.config.ts` — don't leave commented), CORS allow-list.
2. **Rate limiting** — Redis buckets (above), composite keys for OTP.
3. **Authentication** — OTP bcrypt-hashed in Redis; HS256 access + rotating single-use refresh with reuse detection.
4. **Authorization** — role + ownership + `campusId`, enforced in services (cross-campus access impossible when every query is scoped).
5. **Input validation** — zod `.safeParse` on every request; sentinel error on failure.
6. **Payment integrity** — HMAC webhook, idempotency, server pricing, amount check, transaction.
7. **Data protection** — AES-256-GCM PII, private S3, append-only audit, secret management, no PII in logs.

## 9. Deltas from the managerenta template

| managerenta | Prechop | Why |
|---|---|---|
| password + bcrypt login | phone + OTP | identity is a phone number |
| WebAuthn/passkeys | none | no password to strengthen |
| org/tenant scoping (`effectiveOwnerId`) | `campusId` scoping | tenancy is the campus, not an org |
| 2FA ticket flow | not needed | OTP is already the second factor by SMS |

Everything else (envelope, sentinel errors, `withApiHandler∘withAuth`, `__Host-` cookies,
dual-secret JWT, Redis rate-limit, metrics discipline) is adopted as-is.
