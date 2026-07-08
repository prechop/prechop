# 01 — System Architecture

## 1. Overview

Prechop is a **modular monolith**: a single Next.js 16 App Router deployable that serves three
frontend surfaces and one API, backed by MongoDB, Redis, and a handful of third-party providers.
It replaces the former two-process design (`prechop-api` Fastify server + BullMQ worker) with a
**single process** whose background work runs in-process via `cron`.

The internal module boundaries (Auth, Users, Vendors, Menu, Timetable, Daily-Orders,
Buyer-Orders, Payments, Reviews, Notifications, Analytics, Admin, WhatsApp-TV) are preserved so
the system stays microservices-*ready* without being microservices.

## 2. Runtime topology

```
                         ┌───────────────────────────────────────────────┐
        HTTPS            │            Next.js 16 (Node runtime)           │
   buyers / vendors ───► │                                               │
   /admin browsers       │  proxy.ts (edge)   page-shell auth gate       │
                         │        │                                       │
                         │        ▼                                       │
                         │  app/**  (RSC + client "libs/*Wrapper")        │
                         │  app/api/**  route.ts                          │
                         │        │  withApiHandler ∘ withAuth            │
                         │        ▼                                       │
                         │  server/services/*  ── business logic          │
                         │        │                                       │
                         │        ▼                                       │
                         │  server/models/*DB  ── Mongoose (metrics-timed)│
                         │                                               │
                         │  instrumentation.ts → bootstrap()              │
                         │     • connectMongoDB()                         │
                         │     • startCron()   ← all background work      │
                         │     • graceful shutdown                        │
                         └───────┬───────────────┬───────────┬──────┬─────┘
                                 │               │           │      │
                            MongoDB          Redis        Paystack  S3
                          (primary store)  (ioredis)     (payments) (images,
                                            OTP, rate-                receipts)
                                            limit, locks
                                 Sendchamp (SMS) · Resend (email) · web-push (VAPID)
```

## 3. The request pipeline

Every API request flows through the same two composable wrappers (from `src/server/lib`):

```
route.ts export const GET = withApiHandler({ route }, withAuth(async ({ req, auth, context }) => …))
```

**`withApiHandler(options, handler)`** applies, in order:
1. **CSRF** — Origin/Referer allow-list on unsafe methods (skip with `csrf:false`). Runs first so a rejected request burns no rate-limit quota.
2. **Rate limit** — Redis token bucket, default 100/min (override per-route or `false` to do it manually inside the handler, e.g. OTP keyed by phone).
3. **`await connectMongoDB()`** — ensures the singleton connection is live.
4. **Invoke handler**, attach rate-limit headers, and **observe the `http_request_duration_seconds` histogram** (labels `method`, `route`, `status_code`).
5. Any throw → **`handleError(error)`** maps sentinel errors to HTTP codes.

**`withAuth(handler)`** resolves the session and injects `{ req, auth, context }` where
`auth = { userId, role, campusId, token, refreshed }`. On failure it clears cookies and returns a
401 envelope. If the access token was silently refreshed mid-request, it sets fresh cookies before
returning.

**Inside the handler:** validate with a zod `.safeParse` (throw `ErrInvalidFields` on failure),
enforce role/ownership/`campusId`, call a service, return `ok(data)` / `created(data)`.

## 4. Layering (server side)

```
route.ts        thin adapter: auth, validate, delegate, shape response. No Mongoose here.
   │
services/*      business logic, orchestration, cache invalidation, S3, audit, notify.
   │            One function per file + an index.ts barrel per domain.
   ▼
models/*DB      Mongoose access functions. Metrics-timed. Never throw to caller (return null/[]).
                Reads via aggregation pipelines (so soft-delete + id + signed-URL hooks apply).
```

Rules:
- Route files **never** import Mongoose models directly — they call services.
- Services **never** trust client-supplied IDs for ownership — they re-check (e.g. `requireOwnedMenuItem`).
- Scoped queries **always** include `campusId` explicitly (scoping is not global-magic).

## 5. Background work (in-process `cron`)

All background work runs inside the same Node process, started once by `bootstrap()` and made
idempotent with a `globalThis.__prechopCronInit` guard (survives Next hot-reload). BullMQ,
delayed jobs, and the separate worker process are **gone**.

| Job | Trigger | What it does |
|---|---|---|
| Cutoff sweep | `cron` every 1 min | Close `ACTIVE` daily-orders past `cutoffTime`; auto-cancel + Paystack-refund `PAID`-but-unconfirmed buyer-orders; SMS vendor. Redis `cutoff:lock:{id}` dedup. |
| Cutoff warning | `cron` every 1 min | 30-min-to-cutoff notice to buyers (in-app) and vendor (SMS). |
| Abandoned-order sweep | `cron` every 5 min | Cancel `PENDING_PAYMENT` older than 15 min; release Redis slot locks. |
| Analytics aggregate | `cron` daily 00:01 | Upsert per-vendor `analyticsSnapshots`; update vendor lifetime stats. |
| Receipt backstop | `cron` every 10 min | Generate any missing receipt for `COMPLETED` orders (primary path is on-completion). |

**Notifications and receipts are primarily fire-and-forget**, not cron jobs: the request that
causes them calls `void notify(...)` / `void generateReceipt(...)`, which persists to Mongo and
dispatches to Sendchamp/Resend/S3 without blocking or throwing (managerenta's
`void recordAuditEvent` pattern). The cron entries above are backstops/reconcilers.

See `product/04-sequence-flows.md` for the exact-time-vs-sweep reasoning and
`delivery/02-adrs.md` (ADR-002).

## 6. External services

| Service | Client | Used for |
|---|---|---|
| **MongoDB** | Mongoose (singleton on `globalThis`) | primary datastore, all collections |
| **Redis** | ioredis (singleton) | OTP store, rate-limit buckets, slot locks, cron dedup locks, cache |
| **Paystack** | axios wrapper | subaccounts, transaction init (split), webhook verify (HMAC-SHA512), refunds, bank resolve/list |
| **Sendchamp** | axios wrapper | transactional SMS (OTP, order events). Dev logs to console. |
| **Resend** | SDK | transactional email (receipts, vendor welcome/suspension, refunds) |
| **S3** | AWS SDK v3 | direct-upload presigned URLs (menu/profile images), private receipt storage + presigned reads |
| **web-push** | `web-push` (VAPID) | PWA push notifications (replaces Supabase Realtime) |

## 7. Frontend surfaces (one app, route groups)

```
app/
  (public)/         landing, /o/[shareableToken] order page, /order/confirmation, receipt pages
  (buyer)/          campus marketplace, vendor profiles, cart/checkout, my-orders, reviews  (PWA)
  (vendor)/         dashboard home, order pipeline (cooking mode), menu builder, timetable,
                    daily-order composer, earnings/analytics, "Boost Your Order"
  (admin)/          campuses, vendors, orders, flagged reviews, WhatsApp-TVs, platform analytics
  api/**            route handlers (see data-and-api/02-api-reference.md)
```

Auth-gating: `proxy.ts` (edge middleware, `jose`) protects page shells; the API enforces the real
authorization. Real UI lives in `src/libs/<Feature>Wrapper`; `page.tsx` files are `<Suspense>`
wrappers. Data is fetched by SWR hooks in `src/hooks/<Domain>` that shape a presentation
view-model, keeping components dumb.

## 8. Realtime substitute

The Final PRD assumed Supabase Realtime for the vendor's live order feed. With MongoDB that is
replaced by:
- **web-push** for the important events (new paid order, cutoff reached) so a vendor is notified even with the tab closed;
- **SWR revalidation** (`revalidateOnFocus` + a short interval on the cooking-mode screen) for the live list.

## 9. Scaling posture

- **Stateless** app process → scale horizontally behind a load balancer; sessions are JWT, not server memory.
- **Redis and Mongo are shared** across instances; slot locks and rate-limit buckets are therefore correct under horizontal scale.
- **Caveat — cron under multiple instances:** in-process cron runs on *every* instance. Each cron job that mutates state **must** take a Redis lock (e.g. `cutoff:lock:{id}`, or a per-tick `cron:lock:{job}` with a TTL just under the interval) so only one instance acts. This is documented in `delivery/02-adrs.md` (ADR-002) and `delivery/05-ops-runbook.md`.
- `campusId` on every scoped document keeps the door open for per-campus sharding with no schema change.
