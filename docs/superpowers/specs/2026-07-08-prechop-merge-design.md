# Prechop — Merge & Architecture Design Spec

- **Status:** Approved for documentation
- **Date:** 2026-07-08
- **Authors:** Engineering
- **Supersedes assumptions in:** `PreChop_PRD_Final.md` (§NFR tech stack), `prechop-api/README.md` (deployment)

---

## 1. Purpose

`prechop-api` (a Fastify + Prisma/PostgreSQL + Redis/BullMQ backend) and the greenfield
`prechop` frontend are being merged into **one Next.js 16 App Router project**. This spec
records the target architecture, the decisions that shaped it, and the documentation suite
that expands on it.

The project adopts the structural conventions of **managerenta** (a production Next.js 16 +
Mongoose + styled-components + SWR app) and the operational patterns of the **gkoi** system
(runtime config via a single-doc collection, parallel audit streams, Redis helpers,
prom-client metrics).

## 2. Non-negotiable decisions (from the sponsor)

1. **Database is MongoDB + Mongoose.** The Prisma/PostgreSQL schema becomes a *domain
   reference* to translate, not the runtime store.
2. **Single Next.js project.** No separate API server, no separate worker process.
3. **BullMQ is removed.** Background work uses managerenta's in-process `cron` (started from
   `instrumentation.ts`) plus fire-and-forget dispatch. Reuse existing gkoi/managerenta
   infrastructure rather than building bespoke stores.

## 3. Target architecture at a glance

```
┌──────────────────────────── Next.js 16 App Router (single deployable) ────────────────────────────┐
│                                                                                                    │
│  src/app/**            route groups: (buyer) PWA · (vendor) dashboard · (admin) · public /o/[token]│
│  src/app/api/**        thin route.ts handlers  → withApiHandler ∘ withAuth → services → models     │
│  src/server/**         services · models (Mongoose *DB) · validators (zod) · lib · databases       │
│                        constants (siteConfigs, cron, env) · metrics (prom-client) · helpers (S3)   │
│  instrumentation.ts →  bootstrap(): connect Mongo, start cron, register shutdown                   │
│                                                                                                    │
│  external: MongoDB · Redis (ioredis) · Paystack · Sendchamp(SMS) · Resend(email) · S3 · web-push   │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Full detail lives in `docs/architecture/01-system-architecture.md`.

## 4. Key mappings (old → new)

| Concern | prechop-api | Merged Prechop |
|---|---|---|
| HTTP runtime | Fastify + `worker.ts` | Next.js route handlers, one process |
| Persistence | Prisma + PostgreSQL | Mongoose + MongoDB (`models/<coll>/*DB`) |
| Response envelope | `{success, data}` / `{success, error:{code,message}}` | `{code, message, data}` (managerenta) |
| Errors | `AppError` + `domain.errors.ts` | sentinel `Error` singletons mapped in `handleError` |
| Validation | zod per module | zod validators per domain, `.safeParse` → `ErrInvalidFields` |
| Background jobs | BullMQ delayed + repeatable | in-process `cron` + fire-and-forget `void notify()` |
| Auth | RS256 JWT + phone-OTP + refresh rotation | HS256 dual-secret JWT + phone-OTP + refresh rotation + reuse-detection; `jose` in `proxy.ts` |
| Realtime | Supabase Realtime | web-push + SWR revalidation/polling |
| Runtime config | env constants | gkoi `siteConfigs` single-doc collection |
| Rate limit / OTP / slot locks | Redis | ioredis singleton (same helper shapes) |
| Deploy | Railway (api + worker) | single container (Docker/ECS) or Amplify — managerenta targets |

## 5. Background-work redesign (BullMQ removal)

| Old BullMQ job | New mechanism | Cadence |
|---|---|---|
| `cutoff-enforce` (delayed to `cutoffTime`) | `cron` sweep: close expired daily-orders, auto-cancel+refund PAID-unconfirmed | every 1 min |
| `cutoff.warning` (30-min pre) | same 1-min cron | every 1 min |
| `notifications` | fire-and-forget `void notify()` in request path (persist + SMS/email) | inline |
| `receipts` | `@react-pdf/renderer` on `COMPLETED` (fire-and-forget) + cron backstop | on event + 10 min |
| `analytics.aggregate` | `cron` daily aggregate into `analyticsSnapshots` | 00:01 daily |
| `abandoned-orders` sweep | `cron` cancel PENDING_PAYMENT > 15 min, release slot locks | every 5 min |

Trade-off accepted: exact-second cutoff firing becomes ~1-minute polling granularity. The API
already enforces cutoff **synchronously** on order placement (`CUTOFF_PASSED`), so the sweep is
only a dashboard/refund reconciler — 1-minute lag is immaterial. Detail in
`docs/delivery/02-adrs.md` (ADR-002).

## 6. Discrepancies resolved in this design

- **Platform fee:** standardize on **₦50 buyer + ₦100 vendor** (`5000` / `10000` kobo), per the
  Final PRD and the `BuyerOrder.platformFeeKobo` DB default. The `env.ts` defaults of `50`/`100`
  are treated as a bug. Values now sourced from `siteConfigs`. (ADR-004.)
- **Buyer authentication:** the Final PRD (buyers registered + OTP-verified) wins over v2
  (anonymous buyers).
- **Order FSM:** 8-state Final PRD FSM wins over v2's 4-state.
- **Disputes:** documented as a **known gap** with a recommended lightweight model; not added to
  build scope here.
- **SMS provider:** Sendchamp is the live provider (imported under the legacy alias `termii`).

## 7. Documentation suite

```
docs/
├─ 00-overview.md
├─ architecture/  01-system-architecture · 02-c4-diagrams · 03-tech-stack ·
│                 04-folder-structure · 05-deployment-infrastructure · 06-config-reference
├─ data-and-api/  01-data-model · 02-api-reference · 03-auth-and-security ·
│                 04-prisma-to-mongoose-migration
├─ product/       01-domain-model · 02-state-machines · 03-business-rules · 04-sequence-flows
└─ delivery/      01-merge-migration-plan · 02-adrs · 03-testing-strategy ·
                  04-coding-conventions · 05-ops-runbook
```

## 8. Out of scope

- On-platform WhatsApp-TV payments (Phase 2) — Phase 1 read-only directory only.
- Dispute resolution subsystem (documented as a gap).
- Push/FCM native apps (web-push PWA only).
- Multi-country expansion (schema is campus-scoped and ready; not exercised).
