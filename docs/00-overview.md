# Prechop — Documentation Overview

> **"Order before they cook."** — A mobile-first food pre-order platform for Nigerian
> university campuses.

Prechop connects campus food **vendors** (student cooks, stalls, restaurants, bakeries) with
**buyers** (students, staff, campus community). Vendors publish a dated food listing with a
self-set **cutoff time** and share a link; buyers order and **pay upfront via Paystack** before
cooking starts — so vendors cook exact quantities with zero waste and buyers get fresh,
guaranteed food.

This documentation set describes the system **after** the merge of `prechop-api` (the former
Fastify/Prisma backend) and the `prechop` frontend into a **single Next.js 16 project on
MongoDB/Mongoose**.

---

## How to read these docs

| If you want to… | Read |
|---|---|
| Understand the whole system in 10 minutes | this file + `architecture/01-system-architecture.md` |
| See the boxes-and-arrows | `architecture/02-c4-diagrams.md` |
| Know why we chose Mongo / dropped BullMQ | `delivery/02-adrs.md` |
| Add a data model | `data-and-api/01-data-model.md` |
| Add or call an endpoint | `data-and-api/02-api-reference.md` |
| Understand auth, sessions, rate limiting | `data-and-api/03-auth-and-security.md` |
| Understand the product rules | `product/03-business-rules.md` + `product/02-state-machines.md` |
| Execute the merge | `delivery/01-merge-migration-plan.md` |
| Run / operate the app | `delivery/05-ops-runbook.md` |
| Write code that fits in | `delivery/04-coding-conventions.md` |

## Document index

### Architecture
- **01 System Architecture** — the components, request pipeline, background work, external services.
- **02 C4 Diagrams** — context, container, and key component diagrams.
- **03 Tech Stack** — every dependency and why it's here.
- **04 Folder Structure** — the `src/` and `src/server/` layout and naming rules.
- **05 Deployment & Infrastructure** — build, container, environments, scaling.
- **06 Config Reference** — every environment variable and every `siteConfigs` toggle.

### Data & API
- **01 Data Model** — all Mongoose collections, fields, indexes, and the ERD.
- **02 API Reference** — every route handler, grouped by module.
- **03 Auth & Security** — OTP login, JWT/refresh rotation, cookies, rate limiting, the 7 security layers.
- **04 Prisma → Mongoose Migration** — field-by-field translation of the old schema.

### Product & Domain
- **01 Domain Model** — entities, relationships, and the ubiquitous glossary.
- **02 State Machines** — the order and daily-order lifecycles.
- **03 Business Rules** — cutoff, snapshots, campus scoping, fees, completeness, slots.
- **04 Sequence Flows** — order→pay→cook→complete, refund, onboarding, and more.

### Delivery & Ops
- **01 Merge / Migration Plan** — phased plan to fold `prechop-api` into the Next.js app.
- **02 ADRs** — the record of architectural decisions.
- **03 Testing Strategy** — vitest + Playwright, coverage targets.
- **04 Coding Conventions** — the managerenta-derived house style.
- **05 Ops Runbook** — deploy, rollback, incidents, monitoring.

## The three source systems

| System | Role in this project |
|---|---|
| **`prechop-api`** | Source of **domain logic**: modules, business rules, the Paystack flow, the data model (as Prisma). Its behaviour is preserved; its runtime (Fastify/Prisma/BullMQ) is replaced. |
| **`managerenta`** | Source of **structure**: Next.js App Router layout, `withApiHandler∘withAuth`, Mongoose `*DB` conventions, styled-components primitives, SWR hooks, cron, metrics, web-push, testing. |
| **`gkoi`** | Source of **operational patterns**: `siteConfigs` runtime config, parallel audit streams, Redis helper shapes, prom-client metrics discipline, server-resolved IP. |

## Core invariants (true everywhere)

1. **Money is integer kobo.** ₦1 = 100 kobo. No floats. Naira is a display-only concern.
2. **Server computes all prices.** Clients send IDs + quantities only, never prices.
3. **Snapshots freeze history.** Menu edits never mutate a published daily-order or a placed buyer-order.
4. **`campusId` is on every tenant-scoped document** and every scoped query filters on it explicitly.
5. **Cutoff is enforced synchronously at write time**; the cron sweep is only a reconciler.
6. **The response envelope is `{ code, message, data }`.** Errors are thrown sentinels, mapped centrally.
