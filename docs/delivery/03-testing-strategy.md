# 03 — Testing Strategy

Mirrors managerenta: **vitest** for unit/integration on `src/server`, **Playwright** for e2e,
**Biome** + `tsc` as static gates. The goal is real behavioural coverage, not coverage theater.

## Test pyramid

```
        ┌───────────────────────────┐
        │  Playwright e2e (chromium) │   primary user journeys, serial
        ├───────────────────────────┤
        │  Integration (vitest)      │   route handler → service → model, real ephemeral Mongo
        ├───────────────────────────┤
        │  Unit (vitest)             │   pure logic: kobo, completeness, order-number, FSM guards,
        │                            │   price computation, cron sweep selection
        └───────────────────────────┘
```

## CI — `.github/workflows/ci.yml`

**New (2026-07-15): CI now exists.** Previously the gates below were run by hand; there was no
pipeline. Triggers: push to `main`, PRs to `main`, `workflow_dispatch`. A newer push to the same
branch cancels the older run — except on `main`, where every commit keeps its own verdict.

**Every step is blocking.** Nothing is `continue-on-error`, nothing is `|| true`. A pipeline that can
go green while the suite is red is decoration. **Do not add `continue-on-error` to make the badge
green — fix the code or the tests.**

> **⚠️ Expect the first run to be RED, for real reasons, not flakes.** The workflow has never
> executed on GitHub Actions; it is verified only by local reasoning + `actionlint`. Known: `pnpm
> lint` reports pre-existing Biome `format` diagnostics on an LF checkout plus a stale suppression in
> `scripts/seed.ts`. A repo-wide `pnpm format` sweep is scheduled once builders stop editing; until
> then this step fails honestly. Treat the first red as information.

Line endings: CI checks out LF on `ubuntu-latest`, and `.gitattributes` pins the same for Windows
contributors — Biome returns one verdict everywhere, not one per OS.

## Static gates (CI, run first)

- `biome check` — lint + format.
- `tsc --project tsconfig.json` — prod type-check (excludes tests); `ts.check.test` for the test tree.

## Unit tests (vitest)

Fast, no I/O. Target the pure core:
- `helpers/kobo` — naira↔kobo, sumKobo integer-safety.
- `helpers/completeness` — weight table; **and `onboardingChecklist`** (the actual submit gate):
  each missing step, `missing[]` contents, OFF_CAMPUS location requiring state + area + campus.
- `helpers/orderNumber` — format `PCH-YYYY-xxxxxx`, non-sequential.
- **Price computation** — subtotal + delivery + **percentage** fees (BR-2, BR-4): 3% buyer **capped
  at ₦200** (assert the cap binds above ~₦6,667 of food), 8% vendor uncapped, both derived from the
  **food subtotal** and not `totalKobo`; option pricing; `vendorSettlementKobo` floor at 0.
- **`publicRating`** — null below 5 reviews, real average at ≥5; ungated vendors sort below rated
  ones (BR-36).
- **Order FSM guards** — every legal/illegal transition (BR-31, state-machines doc); `INVALID_ORDER_STATE`.
- **Cutoff/abandoned selection predicates** — the queries the cron sweeps use (pure filter functions).

## Integration tests (vitest + ephemeral Mongo)

Each vitest worker gets its **own scratch DB** (`prechop-vitest-{pid}-{poolId}`) — never touches
dev data. `setup.ts` forces `NODE_ENV=test`, injects fake JWT/S3/Paystack secrets, and provides
`tests/helpers/db.ts` (connect/seed/reset) and a `server-only` stub. Cover:
- **Auth** — OTP request/verify, refresh rotation, **reuse detection revokes all tokens**, cookie flags.
- **Vendor onboarding** — each step recomputes completeness (display only); **submit-for-review gates
  on the checklist, not on completeness ≥100**; `NOT_SUBMITTABLE` / `ALREADY_SUBMITTED`; admin
  approve → ACTIVE, reject(reason) → CHANGES_REQUESTED → resubmit. **Regression-guard: completeness
  reaching 100 must NOT activate a vendor** (BR-15/BR-16).
- **Menu/timetable** — ownership guards, bulk validate-all-before-write, soft delete.
- **Daily orders** — snapshotting, MEALS-only addons, ACTIVE-vendor gate, window checks.
- **placeOrder** — slot lock acquire/release, server-side pricing, transactional create, cutoff reject.
- **Webhook** — HMAC verify, amount check, idempotent duplicate → 200 no-op, mark paid + increments.
- **Cancellation/refund** — allowed only PAID/CONFIRMED, refund success/failure paths.
- **Reviews** — completed-only, one-per-order, 72h window, report flags only.
- **Admin** — suspend deactivates user + audits; review moderation recomputes rating.
- **Campus scoping** — a query for campus A never returns campus B's data (BR-26).

### Mocking external providers
Paystack/Sendchamp/Resend/S3/web-push are wrapped in `src/server/providers`. Tests inject fakes at
that boundary (no network). Assert the **contract** (idempotency key sent, split computed, HMAC
verified) not the vendor's internals.

## e2e (Playwright)

`testDir: ./e2e`, serial (`workers:1`), chromium, base URL `http://localhost:3001`. Manually parse
`.env`; inject an `Origin` header so `APIRequestContext` passes the CSRF guard; run `next dev -p
3001` with `DISABLE_RATE_LIMIT=1`. Journeys:
1. Buyer register → OTP → browse marketplace → place order → (mock pay) → my-orders shows PAID.
2. Vendor register → onboard to ACTIVE → publish daily order → cooking mode advances a paid order to COMPLETED.
3. Cutoff: publish with a near cutoff → cron sweep (or forced tick) closes it, late order rejected.
4. Refund: buyer cancels a PAID order → REFUNDED.
5. Review: completed order → submit review within window.
6. Admin: suspend a vendor → vendor login blocked; moderate a flagged review.
7. Push: subscribe → receive a new-order notification (mock VAPID).

## Coverage targets

- **`src/server/**` ≥ 90%** lines/branches (v8 provider). Exclude `types.ts`, `runtime/**`,
  `constants/cron.ts` composition wiring (documented as not-unit-testable glue).
- Every business rule `BR-n` has at least one test referencing it by ID in the test name.

## What we deliberately do NOT test

- Framework internals (Next, Mongoose driver).
- Third-party SDK behaviour (only our adapter contract).
- Styling/visual pixels (leave to manual QA / a future visual-regression pass).

## Test data

`scripts/seed.ts` and `tests/helpers/seed.ts` share fixtures: 2 campuses (ABU, UNILAG), ~20
schools, a super-admin, a couple of ACTIVE vendors with menus/timetables, and a sample daily order.
Money fixtures are always in kobo.
