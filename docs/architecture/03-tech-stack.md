# 03 — Tech Stack

Every runtime and dev dependency, why it is here, and what it replaces from `prechop-api`.
Versions follow the managerenta baseline (Next 16.2 / React 19.2) unless noted.

## Runtime — framework & language

| Package | Role | Notes |
|---|---|---|
| `next` 16.2 | App Router framework — SSR/RSC + API route handlers | Replaces Fastify. `middleware.ts` is `proxy.ts` in Next 16. |
| `react` / `react-dom` 19.2 | UI | Server Components by default; client islands via `"use client"`. |
| `typescript` 6 | language | `strict`, `moduleResolution: bundler`, `paths: {"@/*": "./src/*"}`. |
| `server-only` | enforce the client/server boundary | Everything under `src/server` imports it. |

## Data & cache

| Package | Role | Replaces |
|---|---|---|
| `mongoose` 9 | ODM for MongoDB — primary datastore | Prisma + PostgreSQL |
| `ioredis` | Redis client (singleton on `globalThis`) | the old `ioredis` usage (kept) — OTP, rate-limit, slot locks, cron locks, cache |

MongoDB replaces both PostgreSQL **and** BullMQ's Redis-backed queue (queue is deleted, not
migrated). Redis remains for ephemeral state only.

## Background work

| Package | Role | Replaces |
|---|---|---|
| `cron` | in-process scheduler started by `bootstrap()` | BullMQ queues + `worker.ts` process |

There is no queue library. Async side-effects use fire-and-forget service calls; scheduled work
uses `cron`.

## Auth & security

| Package | Role |
|---|---|
| `jsonwebtoken` | HS256 access/refresh JWTs (dual secrets, algorithm-pinned) — replaces `prechop-api`'s RS256 |
| `jose` | JWT verification inside `proxy.ts` edge middleware (`jsonwebtoken` is not edge-safe) |
| `bcrypt` | OTP hashing, and any password-like secret |
| `zod` 4 | request validation (per-domain validators) — kept from `prechop-api` |
| node `crypto` | refresh-token generation, AES-256-GCM PII encryption, HMAC webhook verify |

WebAuthn/passkeys from managerenta are **not** adopted — Prechop's identity is a phone number +
OTP, so there is no password to upgrade.

## Payments, comms, storage

| Package | Role | Notes |
|---|---|---|
| `axios` | Paystack + Sendchamp HTTP | |
| Paystack (via axios) | subaccounts, tx init w/ split, webhook verify, refunds | HMAC-SHA512 webhook |
| Sendchamp (via axios) | SMS / OTP | live provider; imported under legacy alias `termii` |
| `resend` | transactional email | receipts, vendor welcome/suspension, refunds |
| `@aws-sdk/client-s3` + `s3-request-presigner` | image + receipt storage | direct-to-S3 uploads; private receipts w/ presigned reads |
| `@react-pdf/renderer` | server-side receipt PDF generation | from managerenta; replaces the API's deferred Puppeteer/plain-text receipt |
| `web-push` | PWA push notifications (VAPID) | replaces Supabase Realtime |
| `sharp` | server image resize (if any server-side processing needed) | from managerenta |

## Frontend

| Package | Role |
|---|---|
| `styled-components` 6 | styling with SSR (`StyledComponentsRegistry`), `--pc-*` design tokens |
| `swr` 2 | client data fetching + cache; hooks shape a view-model |
| `motion` | animation |
| `nextjs-toploader` | route progress bar |
| `react-icons` | icons |
| `react-phone-number-input` | phone entry (identity field) |
| `react-select` | selects (campus, category, bank) |
| `qrcode` | pickup/receipt QR if needed |

## Observability

| Package | Role |
|---|---|
| `prom-client` | `http_request_duration_seconds` + `database_request_duration_seconds` histograms; `/api/metrics` behind a bearer token |
| `pino` (optional) | structured logging; or Next's built-in logging |

## Tooling

| Package | Role |
|---|---|
| `@biomejs/biome` | lint + format (tabs, width 4) — replaces ESLint/Prettier |
| `vitest` 4 + `@vitest/coverage-v8` | unit/integration tests; coverage on `src/server/**` |
| `@playwright/test` | e2e, serial, chromium |
| `tsx` | run TS scripts (seed) |

## Explicitly removed (from `prechop-api`)

- `fastify` and all `@fastify/*` plugins → Next route handlers + `withApiHandler`.
- `prisma` / `@prisma/adapter-pg` / `pg` → Mongoose.
- `bullmq` → `cron` + fire-and-forget.
- `ts-node-dev` → `next dev`.
- `puppeteer` (was declared for future PDF) → `@react-pdf/renderer`.
- `termii.provider.ts` (already dead/commented) → deleted.

## Package-manager & scripts (target)

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "biome check",
    "format": "biome format --write",
    "seed": "node --import tsx --env-file=.env scripts/seed.ts",
    "test": "vitest run",
    "test.coverage": "vitest run --coverage",
    "e2e": "playwright test",
    "ts.check": "tsc --project tsconfig.json"
  }
}
```
