# 01 — Merge / Migration Plan

A phased plan to fold `prechop-api` (Fastify/Prisma/BullMQ) into a single Next.js 16 app on
MongoDB/Mongoose, following the managerenta skeleton. Each phase is independently shippable and
leaves the tree in a working state.

## Guiding principles

- **Scaffold first, port per module.** Stand up the Next.js skeleton and cross-cutting
  infrastructure, then move one domain module at a time.
- **Preserve behaviour, replace runtime.** Route paths, envelope semantics, business rules, and
  the Paystack flow are kept; Fastify/Prisma/BullMQ are replaced.
- **No BullMQ.** Every job becomes a cron entry or a fire-and-forget call as you port its module.
- **Test as you port.** Each module lands with its vitest coverage before the next begins.

## Phase 0 — Scaffold (foundations)

1. Initialize the Next.js 16 app in `prechop/` from the managerenta skeleton (App Router,
   TypeScript, Biome, styled-components, SWR).
2. Copy and adapt cross-cutting `src/server/lib`: `handler` (`withApiHandler`), `auth`
   (`withAuth`), `cookies`, `csrf`, `rateLimit`, `response`, `clientIp`.
3. Stand up singletons: `databases/mongoDB.ts`, `databases/redis.ts`; `metrics/`; `constants/env`
   + `assertSecrets`; `runtime/bootstrap.ts` wired from `instrumentation.ts`.
4. Port the error model: sentinel `Error` singletons + `handleError` mapping (from
   `domain.errors.ts`).
5. Establish `constants/cron.ts` (empty, idempotent-guarded) and the `siteConfigs` model + resolver.
6. `proxy.ts` edge auth gate.

**Exit:** app boots, `/health` green, `/api/metrics` gated, an empty authed route round-trips.

## Phase 1 — Data layer

1. Translate every Prisma model into a Mongoose collection under `src/server/models/*`
   (schema + `types.ts` + `*DB` functions), per `data-and-api/04-prisma-to-mongoose-migration.md`.
2. Add the `pre("aggregate")` soft-delete/id/projection hooks and metrics timers.
3. Write `scripts/seed.ts` (campuses ABU + UNILAG, ~20 schools, one super-admin, `siteConfigs`).
4. Unit-test each model's `*DB` functions against an ephemeral test DB.

**Exit:** all collections exist, seed runs, model tests pass.

## Phase 2 — Auth & identity

1. Port OTP login (Sendchamp), HS256 access + rotating refresh with reuse detection, cookie
   handling (`__Host-` in prod).
2. Routes: `/api/auth/*`, `/api/users/*`, `/api/campuses`.
3. Wire `withAuth` to load the user and inject `{ userId, role, campusId }`.
4. e2e: register → OTP → verify → me → refresh → logout.

**Exit:** a buyer and a vendor can authenticate end to end.

## Phase 3 — Vendor domain

1. Vendors (onboarding steps + completeness + Paystack subaccount/bank resolve), Menu, Timetable.
2. S3 presigned upload/confirm for profile + menu images.
3. Auto-activation at completeness 100.

**Exit:** a vendor can complete a profile, build a menu, set a timetable, and go `ACTIVE`.

## Phase 4 — Daily orders & marketplace

1. Daily-order create / from-template / update / close / cancel, with item snapshots and
   MEALS-only addons.
2. Public `/o/:token` and campus `marketplace` feeds.
3. Replace the old delayed `cutoff-enforce` job with the **cron cutoff sweep + warning**.

**Exit:** a vendor can publish a listing; a buyer can see it; cutoff closes it via cron.

## Phase 5 — Buyer orders & payments (the core)

1. `placeOrder` pipeline: Redis slot locks → Paystack init → transactional create.
2. Paystack webhook (HMAC, idempotency, amount check) → mark paid, increment quantities, release locks.
3. Vendor status FSM (cooking mode); buyer/vendor cancel → refund.
4. Replace the `abandoned-orders` BullMQ sweep with the **cron abandoned sweep**.
5. Receipts via `@react-pdf/renderer` on `COMPLETED` + cron backstop.

**Exit:** full order lifecycle works against Paystack test mode, including refunds.

## Phase 6 — Reviews, notifications, analytics, admin

1. Reviews (completed-only, 72h window, report/flag, hidden-until-5).
2. Notifications: in-app + Sendchamp SMS + Resend email + web-push (PWA); fire-and-forget.
3. Analytics: **cron daily aggregate** into snapshots; vendor + admin analytics endpoints.
4. Admin: campuses, schools, vendors (suspend/reactivate audited), orders, review moderation.
5. WhatsApp-TV Phase 1 (vendor read-only directory + admin CRUD).

**Exit:** feature parity with `prechop-api`, plus web-push replacing Realtime.

## Phase 7 — Frontend surfaces

1. Buyer PWA (marketplace, vendor profile, order page, checkout, my-orders, reviews).
2. Vendor dashboard (home/completeness, cooking mode, menu builder, timetable, earnings, Boost).
3. Admin UI.
4. PWA: `sw.js`, manifest, `PwaRegistrar`, `PushToggle`, install prompt.

**Exit:** all three surfaces drive the API; e2e covers each primary route.

## Phase 8 — Hardening & cutover

1. Security pass (enable CSP/headers, verify rate limits, PII encryption, audit coverage).
2. Load test the order path; verify cron single-instance locking under 2+ replicas.
3. Data migration script (only if carrying live Postgres data — see migration doc §"Data migration").
4. Go-live checklist (`architecture/05-deployment-infrastructure.md` §9); switch Paystack to live,
   register the webhook, remove dev SMS bypass.

**Exit:** production deploy, monitored, with rollback ready.

## Sequencing dependencies

```
Phase 0 ─► Phase 1 ─► Phase 2 ─► Phase 3 ─► Phase 4 ─► Phase 5 ─► Phase 6 ─► Phase 7 ─► Phase 8
                                     └────────── Phase 7 UI can begin per-domain once its API lands ──────────┘
```

## Risk register

| Risk | Mitigation |
|---|---|
| Multi-doc transactions need a replica set | provision a Mongo replica set even in staging |
| Cron double-runs under horizontal scaling | Redis lock per mutating cron tick (ADR-002) |
| Losing exact-time cutoff firing | BR-6 enforces at write time; sweep lag is cosmetic |
| Phone uniqueness with encrypted values | add `phoneHash` unique index (migration doc) |
| Embedded item arrays growing unbounded | bounded by a listing's item count; cap if needed |
| Paystack test/live key slip | env-validated at boot; go-live checklist |
