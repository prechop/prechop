# 02 — API Reference

All endpoints are Next.js route handlers under `src/app/api/**/route.ts`, wrapped in
`withApiHandler ∘ withAuth`. Paths keep the `/api` prefix from `prechop-api` so client code and
the Paystack webhook URL are unchanged.

## Envelope

**Success:** `{ "code": 200, "message": null, "data": { … } }`
**Error:** `{ "code": 4xx|5xx, "message": "Human readable", "data": null }`

Helpers: `ok(data, message?, code?)`, `created(data, message?)`, `fail(code, message)`,
`handleError(error)`. List endpoints may add sibling keys (`total`, `stats`) alongside `data`.

## Auth header & cookies

- Protected routes: `Authorization: Bearer <accessToken>` **or** the access-token cookie.
- Refresh token in an httpOnly cookie (`__Host-refreshToken` in prod, `refreshToken` in dev),
  rotated on refresh. See `03-auth-and-security.md`.

## Auth roles

`NONE` (public) · `AUTH` (any logged-in user) · `BUYER` · `VENDOR` · `ADMIN` (SUPER_ADMIN).

---

## Health & meta

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | NONE | Mongo + Redis check → 200/503 |
| GET | `/api/metrics` | token | Prometheus metrics (bearer `METRICS_TOKEN`) |
| GET | `/api/campuses` | NONE | list active campuses (id, name, shortCode, state) |

## Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register/buyer` | NONE | create buyer if new, send OTP. Never reveals if account existed |
| POST | `/api/auth/register/vendor` | NONE | vendor step 1 (account only, needs `campusId`), send OTP |
| POST | `/api/auth/otp/request` | NONE | request login OTP for existing users |
| POST | `/api/auth/otp/verify` | NONE | verify OTP → access token + set refresh cookie + user |
| POST | `/api/auth/refresh` | cookie | rotate refresh token → new access token |
| POST | `/api/auth/logout` | AUTH | revoke refresh token, clear cookie |
| GET | `/api/auth/me` | AUTH | current user |

Rules: OTP 6-digit, bcrypt-hashed in Redis `otp:code:{phone}`, 10-min TTL, single-use; OTP request
3/30min per phone; refresh reuse-detection revokes all tokens (`TOKEN_COMPROMISED`).

## Users — `/api/users`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/users/me` | AUTH | buyer profile |
| PATCH | `/api/users/me` | AUTH | update name |
| PATCH | `/api/users/me/campus` | AUTH | switch campus (must exist + active) |
| DELETE | `/api/users/me` | AUTH | deactivate (soft; preserves history) |

## Vendors — `/api/vendors` (VENDOR unless noted)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/vendors/me` | VENDOR | vendor profile |
| POST | `/api/vendors/me/business-identity` | VENDOR | business info (unique email) |
| POST | `/api/vendors/me/location` | VENDOR | ON_CAMPUS vs OFF_CAMPUS (discriminated) |
| POST | `/api/vendors/me/categories` | VENDOR | set menu categories |
| POST | `/api/vendors/me/profile-image/presign` | VENDOR | S3 upload URL |
| POST | `/api/vendors/me/profile-image/confirm` | VENDOR | confirm upload |
| POST | `/api/vendors/me/bank-details` | VENDOR | resolve acct via Paystack, create subaccount |
| POST | `/api/vendors/me/submit` | VENDOR | **submit for admin review** — `INCOMPLETE`/`CHANGES_REQUESTED` → `PENDING_REVIEW` |
| PATCH | `/api/vendors/me/open-status` | VENDOR | toggle open (only if ACTIVE) |
| GET | `/api/vendors/me/earnings` | VENDOR | own earnings (see Earnings below) |
| GET | `/api/vendors/banks` | VENDOR | Nigerian banks list |
| GET | `/api/vendors/schools` | VENDOR | schools dropdown |
| GET | `/api/vendors/whatsapp-tvs` | VENDOR | campus-scoped TV directory; returns `wa.me` URL, never raw number |
| GET | `/api/vendors/:vendorId/reviews` | NONE | public vendor reviews |

> **⚠️ CORRECTED (2026-07-15).** This section previously read: *"Each onboarding step recomputes
> `profileCompleteness`; at 100 the vendor auto-transitions `INCOMPLETE → ACTIVE` and becomes
> marketplace-visible."* **There is no auto-transition.** Going ACTIVE requires **admin approval**.

Each onboarding step recomputes `profileCompleteness`, but that score **gates nothing** — it is
display/audit only. Going live is:

`INCOMPLETE` → `POST /api/vendors/me/submit` → `PENDING_REVIEW` → admin
`POST /api/admin/onboarding/{id}/approve` → `ACTIVE` (marketplace-visible)
                                          → admin `POST /api/admin/onboarding/{id}/reject` (reason)
                                            → `CHANGES_REQUESTED` → vendor edits → submit again

`POST /api/vendors/me/submit` gates on the **onboarding checklist**, not on completeness:

- Requires: phone verified · `businessName` · ≥1 category · `locationType`
  (OFF_CAMPUS also needs state + area + ≥1 campus) · `paystackSubaccountCode` · `profileImageUrl`
- `409 NOT_SUBMITTABLE` — a checklist step is outstanding
- `409 ALREADY_SUBMITTED` — status is not `INCOMPLETE`/`CHANGES_REQUESTED`
- `200 → { status: "PENDING_REVIEW", profileCompleteness }`
- Side effects: audit (`VENDOR_SUBMIT_FOR_REVIEW`) + submission-received email

**Why not gate on `profileCompleteness >= 100`:** the score awards 25% for menu items and 15% for a
timetable entry, both of which live behind the active-vendor gate — an applicant cannot add them
before approval. Gating on 100% deadlocked every applicant at ~60%. Do not "fix" this back.

## Menu — `/api/menu` (VENDOR)

| Method | Path | Description |
|---|---|---|
| GET | `/api/menu` | list my items |
| POST | `/api/menu` | create (Naira input → kobo) |
| PATCH | `/api/menu/:itemId` | update |
| PATCH | `/api/menu/:itemId/availability` | toggle available |
| PATCH | `/api/menu/:itemId/sold-out` | toggle sold out |
| POST | `/api/menu/reorder` | reorder (validates all IDs owned before applying) |
| DELETE | `/api/menu/:itemId` | soft delete |
| POST | `/api/menu/:itemId/image/presign` · `/confirm` | image upload |

Every mutation runs `requireOwnedMenuItem` (404 if missing, 403 if another vendor's).

## Timetable — `/api/timetable` (VENDOR)

| Method | Path | Description |
|---|---|---|
| GET | `/api/timetable` | weekly grid |
| GET | `/api/timetable/day/:dayOfWeek` | one day |
| GET | `/api/timetable/today-template` | prefill for today's daily-order |
| PUT | `/api/timetable/entry` | upsert one |
| PUT | `/api/timetable/entries` | bulk upsert (validates all before writing) |
| DELETE | `/api/timetable/entry` | delete one |

## Daily Orders — `/api/daily-orders`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/daily-orders/marketplace` | NONE | campus feed, paginated (limit ≤ 20) |
| GET | `/api/daily-orders/public/:shareableToken` | NONE | public order page |
| GET | `/api/daily-orders/my-orders` | VENDOR | vendor's daily orders |
| GET | `/api/daily-orders/my-orders/:orderId` | VENDOR | one |
| POST | `/api/daily-orders` | VENDOR | create (vendor must be ACTIVE; items snapshotted) |
| POST | `/api/daily-orders/from-template` | VENDOR | create from timetable |
| PATCH | `/api/daily-orders/:orderId` | VENDOR | update |
| PATCH | `/api/daily-orders/:orderId/close` | VENDOR | close early |
| PATCH | `/api/daily-orders/:orderId/cancel` | VENDOR | cancel (bulk-refund paid orders) |

Addons allowed only on `MEALS`-category items. Publishing (`isPublic`) makes it eligible for the
cutoff sweep; no delayed job is scheduled (BullMQ removed).

## Buyer Orders & Payments — `/api`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/orders` | BUYER | place order (rate-limited 5/min) — see sequence flows |
| GET | `/api/orders` | BUYER | order history |
| GET | `/api/orders/:orderId` | AUTH | order detail (buyer or owning vendor) |
| GET | `/api/orders/:orderId/receipt` | AUTH | **302** to a freshly-signed S3 URL — see below |
| POST | `/api/orders/:orderId/cancel` | BUYER | cancel (PAID/CONFIRMED only) → refund |
| GET | `/api/vendor/daily-orders/:dailyOrderId/orders` | VENDOR | cooking mode |
| PATCH | `/api/vendor/orders/:orderId/status` | VENDOR | advance FSM (PAID→…→COMPLETED) |
| POST | `/api/vendor/orders/:orderId/cancel` | VENDOR | vendor cancel → refund + SMS |
| POST | `/api/webhook/paystack` | NONE | Paystack webhook (HMAC-SHA512, idempotent, rate-limited 50/min) |

### `GET /api/orders/{orderId}/receipt`

Returns **`302`** with `location:` a freshly-signed S3 URL (**5-minute TTL**) and
`cache-control: private, no-store`. There is **no JSON body and no long-lived `receiptUrl`**.

```bash
# follow the redirect straight to the PDF
curl -L -b "$COOKIE_JAR" https://app.prechop.ng/api/orders/$ORDER_ID/receipt -o receipt.pdf
```

- **Why a redirect, not a URL in JSON:** a pre-signed URL is a **bearer credential** — anyone holding
  it can read the receipt with no auth. Embedding a long-lived one in the order payload would spray
  that credential through every cache, log and client store that touched an order, and it would
  expire invisibly. Signing per request mints it only for a caller who just proved they may see this
  order, and it dies minutes later. **Do not "optimise" this into a stored URL.**
- **Auth:** reuses `getOrderById` — only the **owning buyer or owning vendor**. The receipt inherits
  the order's own access rules.
- **`404`** unless the order is `COMPLETED` (only finished transactions have a receipt).
- **Self-healing:** if the PDF is missing (generation failed, or the order completed before receipts
  shipped) it is rendered synchronously on this path.
- ⚠️ `BuyerOrder.receiptUrl` is **unrelated** — it holds the public `/receipt/{token}` link used by
  the "Pay for Me" flow, not an S3 key.

## Reviews — `/api`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/reviews` | BUYER | submit (COMPLETED order only, one per order, 72h window) |
| GET | `/api/orders/:buyerOrderId/review` | BUYER | my review for an order |
| POST | `/api/reviews/:reviewId/report` | VENDOR | flag (rating unchanged) |

## Notifications — `/api/notifications` (AUTH)

| Method | Path | Description |
|---|---|---|
| GET | `/api/notifications` | list (`?unread=true` optional) |
| PATCH | `/api/notifications/:id/read` | mark read |
| PATCH | `/api/notifications/read-all` | mark all read |
| POST | `/api/push/subscribe` | register a web-push subscription |
| GET | `/api/push/vapid` | public VAPID key |

## Analytics — `/api`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/vendor/analytics` | VENDOR | snapshots + lifetime stats (reads snapshots, never live) |
| GET | `/api/vendors/me/earnings` | VENDOR | own earnings — see below |
| GET | `/api/admin/analytics` | ADMIN | platform summary, top vendors, campus breakdown |

### `GET /api/vendors/me/earnings?range=today|week|month|all`

`range` defaults to `today`. The vendor is resolved from the **session** — there is no `vendorId`
parameter and deliberately no way to ask for someone else's money.

```jsonc
// 200
{
  "bankConnected": true,           // false until a Paystack subaccount exists — Paystack cannot split without one
  "platformFeeVendorKobo": 0,      // ⚠️ RETIRED flat field, always 0. Do NOT render as "₦0 per order"
  "platformFeeVendorPercent": 8,   // the commission rate — use THIS. ⚠️ see the drift warning below
  "totals": { "grossKobo": 660000, "platformFeeKobo": 52800, "netSettledKobo": 607200, "orders": 12 },
  "days": [
    { "date": "2026-07-15", "orders": 12, "grossKobo": 660000, "platformFeeKobo": 52800, "netSettledKobo": 607200 }
  ]
}
```

> **⚠️ Known bug (raised 2026-07-15, not yet fixed — do not document around it).**
> `platformFeeVendorKobo` is the **retired** flat field and is always `0`; it is still returned for
> wire compatibility. More importantly, `platformFeeVendorPercent` is currently read from the **env
> constant**, not from `siteConfigs` — so if an admin sets a vendor rate of, say, 12%, `placeOrder`
> charges **12%** while this endpoint still reports **8%**. It should read
> `getEffectiveFeePolicy()`. Until that lands, treat `platformFeeVendorPercent` as the *env default*,
> not necessarily the live rate. `totals.platformFeeKobo` is unaffected — it is summed from what was
> actually charged and persisted.

- **`grossKobo`** = food + delivery the vendor carries — **not** `amountKobo`, which also contains the
  buyer's service fee, money that was never the vendor's.
- **`platformFeeKobo`** = the 8% commission deducted at split time.
- **`netSettledKobo`** = what Paystack settled **directly** to the vendor's bank. Computed at
  placement and handed to Paystack as the split; never recomputed on read, so the number shown is the
  number actually settled.
- **No `pendingBalanceKobo`, no settlement date — by design.** Paystack subaccount splits settle the
  vendor directly; **Prechop never holds vendor money**, so there is no float a pending balance could
  be a balance *of*, and Prechop does not integrate Paystack's settlements API, so it has no
  settlement date it is entitled to state. Both would be fiction. **Do not add them.**
- **`days`** are **Africa/Lagos** calendar days, bucketed on `paidAt` (falling back to `createdAt`) —
  an order placed 23:58 and paid 00:02 belongs to the new day, and a vendor checking at 00:30 Lagos
  sees today's money, not yesterday's. `week` = last 7 Lagos days, `month` = last 30, both inclusive
  of today.
- Sourced from `Payment` rows with `status: SUCCESS` — **not** `AnalyticsSnapshot`, which carries a
  single `totalRevenueKobo` with no fee split (every read of it overstates what a vendor receives)
  and is only rebuilt nightly (today's money would be missing entirely).

## Admin — `/api/admin` (ADMIN)

| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/admin/campuses` · PATCH `/:id` | manage campuses (unique shortCode) |
| GET/POST | `/api/admin/schools` · PATCH `/:id/toggle-active` | manage schools |
| GET | `/api/admin/vendors` · `/:id` | list (filter campus/status) + detail |
| POST | `/api/admin/vendors/:id/suspend` · `/reactivate` | suspend/reactivate (audited, emails vendor) |
| GET | `/api/admin/onboarding` · `/:id` | **review queue** (`PENDING_REVIEW`), optional `?campusId=` + detail |
| POST | `/api/admin/onboarding/:id/approve` | **approve** → `ACTIVE` · perm `onboarding:approve` |
| POST | `/api/admin/onboarding/:id/reject` | **reject** → `CHANGES_REQUESTED` · perm `onboarding:reject` · body `{ reason }` (1–1000 chars, **required**) |
| POST | `/api/admin/orders/:id/refund` | **manual refund** · perm `refund:create` · see below |
| GET | `/api/admin/orders` · `/:id` | all orders |
| GET | `/api/admin/reviews/flagged` | flagged reviews |
| DELETE | `/api/admin/reviews/:id` | remove (recomputes rating) |
| PATCH | `/api/admin/reviews/:id/unflag` | unflag |
| GET/PATCH | `/api/admin/site-configs` | runtime policy (**not** fees — see `architecture/06-config-reference.md`) |
| GET/POST | `/api/admin/whatsapp-tvs` · PATCH `/:id` · DELETE `/:id` | TV CRUD (DELETE = soft `isActive:false`) |

### `POST /api/admin/orders/{id}/refund` — manual refund

The only path by which a human can move money out of Prechop, and the resolution for anything the
automatic sweeps cannot fix.

```jsonc
// request — `amountKobo` optional; omit for a FULL refund of the order total.
// A partial refund must be a deliberate act, never something you trip into.
{ "reason": "Vendor closed unexpectedly", "amountKobo": 50000 }
```

```jsonc
// 200
{
  "orderId": "…", "orderNumber": "PC-…",
  "outcome": "REFUNDED",          // or "ALREADY_REFUNDED" — no second payout was sent
  "amountKobo": 50000,
  "refundId": "…",                 // persisted Refund record
  "paystackRefundId": "…",         // present once Paystack accepted it
  "message": "Refund issued."
}
```

- **Refundable from:** `PAID`, `CONFIRMED`, `PREPARING`, `READY`, `COMPLETED`, **and `CANCELLED`**.
  `CANCELLED` is included on purpose: an order whose *automatic* refund failed lands there with the
  buyer's money still gone — exactly the case a manual refund exists to resolve.
- **Rejected:** `PENDING_PAYMENT` / `AWAITING_EXTERNAL_PAYMENT` (no money captured) and `REFUNDED`
  (`INVALID_ORDER_STATE`, clearer than a silent no-op).
- `amountKobo` may not exceed the order total; `issueRefund` re-checks against the **payment record**,
  which is the real authority on what was captured.
- Idempotent in effect: a second call returns `ALREADY_REFUNDED` rather than paying out twice.
- Audited (`ORDER_REFUND`) **after** the fact, so a refund that threw is never logged as a success.

## Error codes

Sentinel errors mapped centrally in `handleError`. Representative set (from the old
`domain.errors.ts`, preserved):

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` / `ErrInvalidFields` | 400 | zod parse failed |
| `UNAUTHORIZED` | 401 | missing/invalid token |
| `TOKEN_COMPROMISED` | 401 | refresh reuse detected — all tokens revoked |
| `FORBIDDEN` | 403 | role/ownership/campus mismatch |
| `PROFILE_INCOMPLETE` / `VENDOR_NOT_ACTIVE` | 403 | vendor gate — `assertActiveVendor` rejects `INCOMPLETE`, `PENDING_REVIEW`, `CHANGES_REQUESTED` and `SUSPENDED`. The authoritative gate behind the client-side `VendorStatusGate`: it stops a not-yet-approved vendor from mutating menu/timetable/listings by calling the API directly |
| `NOT_FOUND` | 404 | resource missing |
| `NOT_SUBMITTABLE` | 409 | `POST /api/vendors/me/submit` — an onboarding checklist step is outstanding |
| `ALREADY_SUBMITTED` | 409 | `POST /api/vendors/me/submit` — status is not `INCOMPLETE`/`CHANGES_REQUESTED` |
| `CONFLICT` / `REVIEW_ALREADY_EXISTS` | 409 | uniqueness |
| `CUTOFF_PASSED` | 409 | order after cutoff |
| `SLOT_UNAVAILABLE` | 409 | sold out |
| `INVALID_ORDER_STATE` | 409 | illegal FSM transition |
| `REVIEW_WINDOW_EXPIRED` | 409 | past 72h |
| `PAYMENT_VERIFICATION_FAILED` | 400 | webhook lookup failed |
| `INVALID_WEBHOOK_SIGNATURE` | 401 | bad HMAC |
| `DUPLICATE_WEBHOOK` | 200 | idempotent no-op |
| `RATE_LIMITED` | 429 | includes `retryAfter` |
| `INTERNAL_SERVER_ERROR` | 500 | message hidden in prod |
