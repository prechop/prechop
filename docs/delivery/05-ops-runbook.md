# 05 — Ops Runbook

Operational procedures for running Prechop in production. Assumes a container host (ECS/Railway/
Fly/VPS) with a MongoDB replica set and a managed Redis.

## 1. Services & processes

- **One** Next.js container (`node server.js`, standalone output). Cron runs inside it via
  `instrumentation.ts → bootstrap()`. **No separate worker.**
- Dependencies: MongoDB (replica set), Redis (TLS), Paystack, Sendchamp, Resend, S3.

## 2. Boot sequence

`instrumentation.register()` → `bootstrap()`:
1. `assertSecrets()` — refuses to start on missing/weak/duplicate JWT secrets or missing required env.
2. `connectMongoDB()` — singleton connection.
3. `startCron()` — idempotent (`globalThis.__prechopCronInit`).
4. register SIGINT/SIGTERM graceful shutdown (disconnect Mongo + Redis).

If the app won't start, check the boot logs for the failed assertion first.

## 3. Health & monitoring

- **`/health`** — checks Mongo + Redis, returns 200/503. Wire to the load balancer.
- **`/api/metrics`** — Prometheus (bearer `METRICS_TOKEN`). Key series:
  - `http_request_duration_seconds{route,status_code}` — latency + error rate per route.
  - `database_request_duration_seconds{collection,method,success}` — DB health.
- **Alerts (recommended):** 5xx rate > 1%, webhook failures, refund failures, order-placement
  latency p95, cron tick missed, Mongo/Redis down.

## 4. Cron under horizontal scaling ⚠️

Cron runs on **every** instance. Each mutating job takes a Redis lock so only one instance acts:
- Cutoff sweep: `cutoff:lock:{dailyOrderId}` (EX 300, NX) per listing.
- Per-tick guard for global jobs: `cron:lock:{job}` with a TTL just under the interval.

**If you see double refunds or duplicate notifications**, a cron lock is missing or Redis is
partitioned — verify Redis connectivity and the lock code before scaling replicas.

## 5. Common procedures

### Deploy
1. CI green (biome, tsc, vitest ≥90%, playwright).
2. Build image (`buildspec.yml`) → push ECR (commit-hash tag).
3. Roll out to ECS/host. `/health` must go green before shifting traffic.
4. No DB migrate step (schemaless); run any data script explicitly (below).

### Rollback
Re-deploy the previous image tag. Because there are no destructive schema migrations, rollback is
image-only. If a data script ran, assess whether it needs reversing (scripts should be written
idempotent/reversible).

### Run a data/maintenance script
`node --import tsx --env-file=.env scripts/<name>.ts` on a one-off task or a maintenance instance.
Never run untested scripts against prod; dry-run against a restored snapshot first.

### Rotate a secret
1. Add the new secret in the host's env store.
2. For JWT secrets, rotating **invalidates existing sessions** (users re-login) — do it in a
   low-traffic window. Access and refresh secrets must stay distinct.
3. Redeploy; confirm boot assertion passes.

### Change a business policy (fee, flag, kill switch)
Update the `siteConfigs` document (admin UI or a script). Takes effect within the ~10s cache TTL —
**no redeploy**. Every change is audited (previous/new state).

### Maintenance mode
Set `siteConfigs.ordersKillSwitch = true` (and/or `paymentsKillSwitch`) to reject new orders while
keeping the app up. Reverse when done. This is the gkoi monitor→enforce kill-switch pattern.

## 6. Incident playbooks

### Payments not marking paid
1. Check Paystack dashboard for webhook delivery + response codes.
2. Verify the webhook URL and that Paystack IPs are whitelisted at the edge.
3. Check `INVALID_WEBHOOK_SIGNATURE` / `PAYMENT_VERIFICATION_FAILED` logs (HMAC/secret mismatch).
4. Manually reconcile: look up the `payments` doc by `paystackRef`; if Paystack shows success but
   the order is `PENDING_PAYMENT`, re-drive the mark-paid path (idempotent) or trigger a verify.
5. The abandoned sweep will cancel truly-unpaid orders after 15 min and release slot locks.

### Refunds failing
Refund failures are logged and surfaced (never swallowed). Retry the refund from the admin/order
tooling; if Paystack rejects, escalate with the `paystackRef`. The order stays `CANCELLED` pending
`REFUNDED`.

### SMS/OTP not arriving
1. Confirm `SENDCHAMP_*` env and that the dev console-log bypass is off in prod.
2. Check the Sendchamp dashboard for sender-ID approval and delivery status.
3. OTP is in Redis `otp:code:{phone}` (hashed, 10-min TTL) — a user can request a new one (3/30min limit).

### Cutoff listings not closing
1. Confirm the container is warm and cron is running (log line each tick).
2. Check the `cutoff:lock` keys in Redis aren't stuck.
3. Remember BR-6 already blocks late orders — a stuck sweep delays *closing/refunds*, not safety.

### Mongo transaction errors
`placeOrder` needs a replica set. If you see "Transaction numbers are only allowed on a replica
set", the Mongo deployment is standalone — fix the topology.

## 7. Backups & data

- MongoDB: automated snapshots + point-in-time recovery; test a restore quarterly.
- Redis: no durable data (TTL-only) — safe to flush in an emergency, but this drops in-flight OTPs
  and slot locks (users retry; abandoned sweep reconciles).
- S3: receipts are private; lifecycle-expire per retention policy.

## 8. Scaling notes

- App is stateless → scale horizontally; watch the cron-lock caveat (§4).
- Mongo: scale reads with the replica set; shard by `campusId` if a single campus outgrows a node.
- Redis: size for OTP + rate-limit + slot-lock volume; enable TLS.

## 9. Go-live checklist

See `architecture/05-deployment-infrastructure.md` §9 — the authoritative pre-launch list
(secrets, Paystack live keys + webhook, Sendchamp sender ID, Redis TLS, VAPID, `siteConfigs` seed,
metrics token, `/health`, security headers).
