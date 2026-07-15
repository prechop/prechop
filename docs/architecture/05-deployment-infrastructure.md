# 05 — Deployment & Infrastructure

## 1. Deployable unit

**One** Next.js container. Because BullMQ and the separate `worker.ts` process are gone, there is
no second service to deploy. Background work runs inside the same container via `cron`, started by
`instrumentation.ts`.

> If the app is ever horizontally scaled, cron runs on every instance — every mutating cron job
> must take a Redis lock so only one instance acts per tick. See ADR-002 and the runbook.

## 2. Build

Next.js **standalone output** (`output: "standalone"` in `next.config.ts`) produces a minimal
`server.js` + traced `node_modules`. Native/server-only packages are listed in
`serverExternalPackages` so they load at runtime rather than being bundled:

```ts
// next.config.ts (excerpt)
serverExternalPackages: [
  "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner",
  "bcrypt", "cron", "ioredis", "mongoose", "prom-client", "sharp",
  "@react-pdf/renderer",
],
```

### Dockerfile (multi-stage, from managerenta)

```
FROM node:20-alpine AS deps      # install deps
FROM node:20-alpine AS builder   # next build → .next/standalone
FROM node:20-alpine AS runner    # non-root nextjs user, CMD ["node", "server.js"]
```

## 3. Hosting targets

Two supported targets (managerenta ships both):

| Target | How | Best for |
|---|---|---|
| **Container platform** (ECS / Railway / Fly / VPS) | `Dockerfile` via `buildspec.yml` (CodeBuild → ECR → ECS) | production; keeps a warm process so cron is reliable |
| **AWS Amplify** | `amplify.yml`, `yarn build`, artifacts `.next` | quick staging |

Prefer a **container platform** for production: cron needs a persistent process. On a purely
serverless target, cron would not run — you would replace the cron entries with an external
scheduler (EventBridge / cron service) calling secured internal routes. That variant is documented
in ADR-002 as the fallback but is **not** the chosen path.

## 4. Environments

| Env | DB | Redis | Paystack | SMS | Purpose |
|---|---|---|---|---|---|
| `development` | local Mongo | local Redis | `sk_test_` | console log | local dev |
| `test` | ephemeral per-worker DB | local Redis | mocked | mocked | vitest/e2e |
| `production` | Mongo replica set | managed Redis (TLS) | `sk_live_` | Sendchamp live | live |

`NODE_ENV` and all runtime config are validated at boot (`assertRuntimeConfig()` in `bootstrap.ts`):
the app **refuses to start in production** on a missing/weak/duplicate secret, a malformed fee env
var, or any of the "silent failure" vars whose dev defaults are dangerous in production —
`OTP_PROVIDER`, `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`, `MONGODB_URI`, `REDIS_URI`. Outside
production it warns instead of throwing. See `06-config-reference.md`.

Region: **`af-south-1` (Cape Town)** for lowest latency to Nigeria (S3 bucket + compute).

## 5. Data stores

- **MongoDB** — a replica set in production (needed for multi-document transactions used by
  `placeOrder`, and for durability). `maxPoolSize: 10`, `serverSelectionTimeoutMS: 8000`.
- **Redis** — managed instance with TLS in production. Holds OTPs, rate-limit buckets, slot locks,
  cron locks, and cache. No persistence requirement beyond TTL correctness.

## 6. External integration setup

- **Paystack webhook** → `https://<host>/api/webhook/paystack`. Whitelist Paystack IPs at the edge; verify HMAC-SHA512 in the handler regardless.
- **S3 bucket** → private ACL + SSE; CORS configured for direct browser PUT (presigned uploads).
- **Sendchamp** → approved sender ID; remove the dev console-log bypass for production.
- **web-push** → generate a VAPID keypair; store the triple in env.

## 7. CI/CD

```
push → CI:
  biome check           (lint/format)
  tsc --project tsconfig (type-check, prod)
  vitest run --coverage  (unit/integration, >90% on src/server)
  playwright test        (e2e, chromium)
→ build image (buildspec) → push ECR (commit-hash tag) → deploy ECS
```

Migrations: MongoDB is schemaless, so there is no `migrate deploy` step. Schema/data migrations
are handled by versioned scripts in `scripts/` run explicitly (see runbook).

## 8. Observability & ops

- `/api/metrics` (bearer-token protected) → Prometheus scrape.
- `/health` route checks Mongo + Redis, returns 200/503 for the load balancer.
- Structured logs to stdout (container platform aggregates).
- Recommended: Sentry for error tracking; alerting on 5xx rate, webhook failures, refund failures.

## 9. Pre-go-live checklist

- [ ] `NODE_ENV=production`; all secrets set and validated at boot.
- [ ] Paystack keys switched to `sk_live_`; webhook URL registered; IPs whitelisted.
- [ ] Sendchamp sender ID approved; dev SMS console bypass removed.
- [ ] Redis TLS on; Mongo replica set with backups.
- [ ] VAPID keys set; PWA manifest + `sw.js` served.
- [ ] `siteConfigs` seeded (platform fees, feature flags, kill switches).
- [ ] Metrics token set; `/health` wired to the LB; alerts configured.
- [ ] Security headers/CSP enabled in `next.config.ts` (not left commented out).
