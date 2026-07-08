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

## Static gates (CI, run first)

- `biome check` — lint + format.
- `tsc --project tsconfig.json` — prod type-check (excludes tests); `ts.check.test` for the test tree.

## Unit tests (vitest)

Fast, no I/O. Target the pure core:
- `helpers/kobo` — naira↔kobo, sumKobo integer-safety.
- `helpers/completeness` — weight table, `isProfileComplete` boundary at 100.
- `helpers/orderNumber` — format `PCH-YYYY-xxxxxx`, non-sequential.
- **Price computation** — subtotal + delivery + platform fee (BR-2, BR-4); addon pricing;
  `vendorAmountKobo` floor at 0.
- **Order FSM guards** — every legal/illegal transition (BR-31, state-machines doc); `INVALID_ORDER_STATE`.
- **Cutoff/abandoned selection predicates** — the queries the cron sweeps use (pure filter functions).

## Integration tests (vitest + ephemeral Mongo)

Each vitest worker gets its **own scratch DB** (`prechop-vitest-{pid}-{poolId}`) — never touches
dev data. `setup.ts` forces `NODE_ENV=test`, injects fake JWT/S3/Paystack secrets, and provides
`tests/helpers/db.ts` (connect/seed/reset) and a `server-only` stub. Cover:
- **Auth** — OTP request/verify, refresh rotation, **reuse detection revokes all tokens**, cookie flags.
- **Vendor onboarding** — each step recomputes completeness; auto-activation at 100.
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
