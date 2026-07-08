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
| PATCH | `/api/vendors/me/open-status` | VENDOR | toggle open (only if ACTIVE) |
| GET | `/api/vendors/banks` | VENDOR | Nigerian banks list |
| GET | `/api/vendors/schools` | VENDOR | schools dropdown |
| GET | `/api/vendors/whatsapp-tvs` | VENDOR | campus-scoped TV directory; returns `wa.me` URL, never raw number |
| GET | `/api/vendors/:vendorId/reviews` | NONE | public vendor reviews |

Each onboarding step recomputes `profileCompleteness`; at 100 the vendor auto-transitions
`INCOMPLETE → ACTIVE` and becomes marketplace-visible.

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
| POST | `/api/orders/:orderId/cancel` | BUYER | cancel (PAID/CONFIRMED only) → refund |
| GET | `/api/vendor/daily-orders/:dailyOrderId/orders` | VENDOR | cooking mode |
| PATCH | `/api/vendor/orders/:orderId/status` | VENDOR | advance FSM (PAID→…→COMPLETED) |
| POST | `/api/vendor/orders/:orderId/cancel` | VENDOR | vendor cancel → refund + SMS |
| POST | `/api/webhook/paystack` | NONE | Paystack webhook (HMAC-SHA512, idempotent, rate-limited 50/min) |

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
| GET | `/api/admin/analytics` | ADMIN | platform summary, top vendors, campus breakdown |

## Admin — `/api/admin` (ADMIN)

| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/admin/campuses` · PATCH `/:id` | manage campuses (unique shortCode) |
| GET/POST | `/api/admin/schools` · PATCH `/:id/toggle-active` | manage schools |
| GET | `/api/admin/vendors` · `/:id` | list (filter campus/status) + detail |
| POST | `/api/admin/vendors/:id/suspend` · `/reactivate` | suspend/reactivate (audited, emails vendor) |
| GET | `/api/admin/orders` · `/:id` | all orders |
| GET | `/api/admin/reviews/flagged` | flagged reviews |
| DELETE | `/api/admin/reviews/:id` | remove (recomputes rating) |
| PATCH | `/api/admin/reviews/:id/unflag` | unflag |
| GET/POST | `/api/admin/whatsapp-tvs` · PATCH `/:id` · DELETE `/:id` | TV CRUD (DELETE = soft `isActive:false`) |

## Error codes

Sentinel errors mapped centrally in `handleError`. Representative set (from the old
`domain.errors.ts`, preserved):

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` / `ErrInvalidFields` | 400 | zod parse failed |
| `UNAUTHORIZED` | 401 | missing/invalid token |
| `TOKEN_COMPROMISED` | 401 | refresh reuse detected — all tokens revoked |
| `FORBIDDEN` | 403 | role/ownership/campus mismatch |
| `PROFILE_INCOMPLETE` / `VENDOR_NOT_ACTIVE` | 403 | vendor gate |
| `NOT_FOUND` | 404 | resource missing |
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
