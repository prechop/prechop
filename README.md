# Prechop

**Order before they cook.** A Nigerian campus food pre-order marketplace. Vendors
publish dated daily-order listings with a cutoff time; buyers reserve and pay
upfront via Paystack before the kitchen starts cooking — so nothing sells out and
nobody waits in a queue.

Prechop is a single **Next.js 16** application (App Router) that contains both the
React front-end and the API. Data lives in **MongoDB** (Mongoose); **Redis** backs
OTP storage, slot-reservation locks, rate limiting, and single-instance cron
coordination.

## Stack

| Layer      | Choice                                                             |
| ---------- | ------------------------------------------------------------------ |
| Framework  | Next.js 16.2 (App Router, `proxy` middleware), React 19            |
| Language   | TypeScript 6 (strict), path alias `@/*` → `src/*`                  |
| UI         | styled-components 6 (SSR via registry), SWR 2, design tokens       |
| Data       | MongoDB + Mongoose 9, Redis (ioredis)                              |
| Auth       | Phone + OTP, HS256 dual-secret JWT (access + refresh cookies)      |
| Payments   | Paystack split subaccounts (HMAC-SHA512 webhook, idempotent)       |
| Background | In-process `cron` started from `instrumentation.ts` (no queue)     |
| Tooling    | pnpm, Biome (tabs, width 4), Vitest, Playwright, prom-client       |

## Prerequisites

- **Node** ≥ 20, **pnpm** 9 (`corepack enable`)
- **MongoDB** and **Redis** reachable locally (defaults: `mongodb://127.0.0.1:27017`,
  `redis://127.0.0.1:6379`)

## Getting started

```bash
pnpm install
cp .env.example .env   # then fill in the values (see "Environment" below)
pnpm seed              # campuses, schools, super-admin, a demo vendor + live listing
pnpm dev               # http://localhost:3000
```

After seeding you can log in with these phone numbers (the OTP prints to the server
console in dev — `OTP_PROVIDER=console`):

| Role        | Phone         |
| ----------- | ------------- |
| Super admin | `08130135756` |
| Buyer       | `08111111111` |
| Vendor      | `08122222222` |

## Environment

- **`.env.example`** — the tracked template. Every required variable is listed with
  guidance (including one-liners to generate the JWT secrets, `ENCRYPTION_KEY`, and
  VAPID keypair).
- **`.env`** and **`.env.production`** — your real local/production values. Both are
  **gitignored** and must never be committed — they hold live credentials
  (JWT secrets, the AES-256-GCM `ENCRYPTION_KEY`, Paystack/AWS/Sendchamp keys).
  Copy the example, fill it in, and for production point `MONGODB_URI` / `REDIS_URI`
  at your managed instances and use Paystack **live** keys.

Money is always handled as **integer kobo** on the wire. The platform fee is
canonical in `siteConfigs` (₦50 buyer / ₦100 vendor by default) and editable from
the admin settings screen.

## Scripts

| Command              | What it does                                             |
| -------------------- | -------------------------------------------------------- |
| `pnpm dev`           | Start the dev server                                     |
| `pnpm build`         | Production build                                         |
| `pnpm start`         | Serve the production build (`next start`)                |
| `pnpm seed`          | Idempotent dev seed (safe to re-run)                     |
| `pnpm lint`          | Biome check (lint + format verification)                 |
| `pnpm format`        | Biome format --write                                     |
| `pnpm ts.check`      | Full TypeScript typecheck                                |
| `pnpm test`          | Vitest unit + integration suite                          |
| `pnpm test.coverage` | Vitest with V8 coverage over `src/server/**`             |
| `pnpm e2e`           | Playwright smoke suite (builds & serves, needs `seed`)   |

> **Tests** run against your local Mongo/Redis using a **per-worker throwaway
> database** (`prechop-vitest-<pid>-<pool>`) and drop it on teardown — they never
> touch the `prechop` dev database. The Playwright e2e config pins `next start` to
> the local Mongo/Redis regardless of `.env.production`.

## Project layout

```
src/
  app/                Next.js routes — pages + /api/** route handlers
  components/         Design-system primitives (Button, Card, Input, …)
  constants/          Client api client, fetcher, formatters, types glue
  hooks/              useAuth, useToast, …
  layouts/            AppShell (buyer/vendor), AdminShell
  libs/               Feature "wrapper" clients (one folder per screen)
  server/             The backend, server-only:
    constants/          env, crypto, kobo math, cron, error mapping
    databases/          Mongo + Redis singletons
    lib/                withApiHandler ∘ withAuth, response envelope, CSRF, rate limit
    models/             17 Mongoose collections + typed *DB functions
    providers/          Paystack, Sendchamp, Resend, S3, web-push
    services/           Domain logic (auth, orders, payments, vendors, admin, …)
    validators/         Zod request schemas
  proxy.ts            Edge middleware — auth-shell gate (real gate is withAuth)
  instrumentation.ts  Composition root — bootstrap() wires cron + shutdown
scripts/seed.ts       Development seed
tests/                Vitest suite (+ helpers)
e2e/                  Playwright smoke suite
```

## Health & metrics

- `GET /api/health` — liveness/readiness; 200 when Mongo **and** Redis answer, else 503.
- `GET /api/metrics` — Prometheus metrics (request + DB timing histograms).

## Payments flow (summary)

1. Buyer builds a cart on a public listing (`/o/<shareableToken>`) and checks out.
2. `placeOrder` reserves slots atomically in Redis (oversell guard), initialises a
   Paystack split transaction, then persists the order + payment.
3. The buyer pays on Paystack and is returned to `/order/confirmation`.
4. Paystack's webhook (`/api/webhook/paystack`, HMAC-SHA512 verified, idempotent)
   marks the payment paid, commits the reserved slots, and notifies both parties.
