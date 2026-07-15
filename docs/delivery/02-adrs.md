# 02 — Architecture Decision Records

Each ADR records a decision, its context, and its consequences. Status: `Accepted` unless noted.

---

## ADR-001 — Single Next.js app (merge the API)

**Status:** Accepted
**Context:** `prechop-api` was a standalone Fastify service plus a separate BullMQ worker; the
frontend was a separate greenfield repo. Two deployables, two runtimes, duplicated types.
**Decision:** Merge both into **one Next.js 16 App Router project**. API becomes route handlers;
UI and API share types and a single deploy.
**Consequences:** Simpler ops and shared types; but the app process now owns background work
(see ADR-002), and route handlers must adopt the `withApiHandler∘withAuth` layering to keep the
former `routes→services→repos` discipline.

---

## ADR-002 — Remove BullMQ; use in-process cron + fire-and-forget

**Status:** Accepted
**Context:** `prechop-api` used BullMQ for delayed jobs (cutoff-enforce fired exactly at
`cutoffTime`), repeatable sweeps, and async notification/receipt/analytics work, run in a separate
worker process. A single Next.js app has no persistent worker, and the sponsor directed removing
BullMQ in favour of existing gkoi/managerenta patterns.
**Decision:** Delete BullMQ. Use managerenta's in-process **`cron`** (started by `bootstrap()`,
idempotent via a `globalThis` guard) for scheduled work, and **fire-and-forget** service calls
(`void notify()`, `void generateReceipt()`) for async side-effects.
- Cutoff enforcement → 1-minute cron sweep (reconciler).
- Abandoned orders → 5-minute cron sweep.
- Analytics → daily 00:01 cron.
- Notifications/receipts → fire-and-forget with cron backstops.
**Consequences:**
- Exact-second cutoff firing becomes ~1-minute polling granularity. **Acceptable** because the API
  enforces cutoff synchronously at order placement (BR-6); the sweep only closes listings and
  reconciles refunds.
- No per-job retry queue; fire-and-forget is best-effort with cron backstops for durability-critical
  work (receipts).
- **Under horizontal scaling, cron runs on every instance** — every mutating cron job must take a
  Redis lock (`cutoff:lock:{id}` or `cron:lock:{job}` with a sub-interval TTL) so only one instance
  acts per tick.
**Alternatives rejected:** keep BullMQ + a second process (contradicts "single project" and the
sponsor's directive); external scheduler hitting internal routes (needed only on a purely
serverless host — documented as the fallback, not chosen).

---

## ADR-003 — HS256 dual-secret JWT instead of RS256

**Status:** Accepted
**Context:** `prechop-api` signed access tokens with RS256 (asymmetric, public/private PEM keys),
useful when a separate service must verify tokens with only a public key. In a single app there is
no separate verifier.
**Decision:** Use **HS256 with two distinct secrets** (`JWT_ACCESS_TOKEN_SECRET`,
`JWT_REFRESH_TOKEN_SECRET`), algorithm-pinned, matching the managerenta pattern. Edge verification
in `proxy.ts` uses `jose`.
**Consequences:** Simpler key management (no PEM handling, no `\n` escaping); secrets validated at
boot (must differ, ≥32 chars). If Orders/Payments are ever extracted to a separate service that
must verify tokens independently, revisit (could reintroduce asymmetric keys for that boundary).

---

## ADR-004 — Platform fee canonicalized in `siteConfigs`

**Status:** ⚠️ **SUPERSEDED (2026-07-15) by ADR-004a.** The flat-fee model this ADR canonicalized
was never implemented and has been ruled *not* the product. Kept for the record — do not implement.

**Context:** The platform fee was inconsistent across sources: `env.ts` defaulted `50`/`100` kobo,
the Prisma `BuyerOrder.platformFeeKobo` default was `5000`, and the Final PRD stated ₦50 buyer +
₦100 vendor (with an internal ₦100-vs-₦150 contradiction).
**Decision:** Canonical values are **₦50 buyer (`5000` kobo) + ₦100 vendor (`10000` kobo)**,
matching the Final PRD and the DB default. They are stored in **`siteConfigs`**
(`platformFeeBuyerKobo` / `platformFeeVendorKobo`) so an admin can tune them without a redeploy;
the env constants are fallbacks only. The `env.ts` `50`/`100` defaults are treated as a bug.
**Consequences:** One source of truth; admin-tunable; the buyer fee is a visible checkout line item,
the vendor fee a settlement deduction (`vendorAmountKobo = subtotal + delivery − vendorFee`).

---

## ADR-004a — Platform fee is a **percentage**, admin-governed via `siteConfigs`

**Status:** Accepted (2026-07-15, product-ruled) — supersedes ADR-004.

**Context:** ADR-004 canonicalized a flat ₦50/₦100 fee in `siteConfigs`. The code never implemented
it. What actually shipped — and what has been charging real orders — is a **percentage** model in
`src/constants/fees.ts`, while the `siteConfigs` flat-kobo fields sat at default `0`, editable in
admin, **read by nothing**. So the "one source of truth" ADR-004 claimed to establish did not exist:
the admin UI governed a number with no effect, and ADR-004's own premise (that the `env.ts`
`50`/`100` defaults were "a bug") was itself the stale half.

**Decision:**
1. The **percentage model is the product**:
   - Buyer service fee: **3% of food subtotal, capped at ₦200** — added to the checkout total as a
     visible line item (`paymentProcessingFeeKobo`).
   - Vendor commission: **8% of food subtotal**, uncapped — deducted from settlement
     (`prechopCommissionKobo`); `vendorSettlementKobo = foodSubtotal + delivery − commission`.
   - Both derive from the **food subtotal** (items + selected options), never from `totalKobo`
     (which contains the buyer's own fee).
2. The policy is **admin-governed in `siteConfigs`** — `platformFeeBuyerPercent`,
   `platformFeeBuyerMaxKobo`, `platformFeeVendorPercent` — with **env (`PLATFORM_FEE_*`) as the
   fallback**. Precedence: valid `siteConfigs` ► env ► hard-coded. A rate change needs **no redeploy**.
3. The flat-kobo fields are **retired** — removed from the schema, defaults and validator, and left
   `@deprecated` in the type only so out-of-slice readers compile.
4. **A config problem must never charge 0.** `resolveFeePolicy` is the single place that decides what
   a fee is: absent → quiet fallback; present-but-invalid (`""` → `0`, `"8%"` → `NaN`, negative,
   >100%, wrong type, legacy doc) → **loud** fallback to the standing rate; explicit valid `0` →
   honoured (a promo is not a typo).

**Consequences:**
- Admins can now genuinely move fees, and the number they set is the number charged.
- Two call sites must stay in lockstep: `placeOrder` (`resolveFeePolicy`) and the buyer's quote
  (`getEffectiveFeePolicy`). Both read the same config through the same guard by design — **any new
  surface that displays a fee must use `getEffectiveFeePolicy`, not the env constants**, or it will
  quote a stale rate the moment an admin changes one. *(This is live today in
  `getVendorEarnings` — see FINDINGS.)*
- **Field-name trap** (both collections, live today): `Payment.platformFeeKobo` holds the **vendor
  commission**, `BuyerOrder.platformFeeKobo` holds the **buyer's service fee**. Same name, different
  pockets. Prefer `prechopCommissionKobo` / `paymentProcessingFeeKobo`, which are unambiguous.

---

## ADR-005 — MongoDB + Mongoose (replace Prisma/PostgreSQL)

**Status:** Accepted (sponsor-directed)
**Context:** The sponsor requires MongoDB/Mongoose to match managerenta and the house stack.
**Decision:** MongoDB is the primary store; the Prisma schema is a domain reference translated to
Mongoose collections (see migration doc). Relational item tables become **embedded** subdocuments
where always-read-with-parent; other relations are `ObjectId` references.
**Consequences:** Multi-document transactions (order+items+payment) require a **replica set**.
Cross-collection uniqueness on embedded arrays isn't native → app-level guards. Reads use
aggregation pipelines so shared hooks (soft-delete, id, signed URLs) apply. Row-level `SELECT FOR
UPDATE` is replaced by Redis slot locks + transactions.

---

## ADR-006 — web-push + SWR polling replace Supabase Realtime

**Status:** Accepted
**Context:** The Final PRD assumed Supabase Realtime for the vendor's live order feed; Supabase is
gone with the move to MongoDB.
**Decision:** Use **web-push (VAPID)** for important events (new paid order, cutoff reached) and
**SWR revalidation** (focus + short interval on cooking-mode) for the live list.
**Consequences:** Works with the tab closed (push) and provides near-real-time list updates without
a websocket layer. Slightly higher latency than a socket push for list refresh; acceptable for the
order-prep use case.

---

## ADR-007 — Keep the `/api` prefix and response envelope semantics

**Status:** Accepted
**Context:** Existing clients and the Paystack webhook URL target `/api/...`; the old envelope was
`{success, data}`.
**Decision:** Keep the `/api` route prefix. Adopt managerenta's `{code, message, data}` envelope
(with `ok/created/fail/handleError`) as the single house shape; map all former `AppError` codes to
sentinel errors.
**Consequences:** Webhook URL unchanged; client code updates the envelope-unwrap shape once
(`res.data.data`) — encapsulated in the shared axios fetcher.

---

## ADR-008 — Disputes deferred (documented gap)

**Status:** Accepted (deferral)
**Context:** The Final PRD references dispute resolution but has no data model; v2 had a `Dispute`
entity. `prechop-api` has `Refund` but no `Dispute`.
**Decision:** Do **not** add disputes in this merge. Document a recommended minimal model
(`product/03-business-rules.md` §Known gaps) for a future spec.
**Consequences:** Admin handles refunds directly for now; a dispute workflow is a clean future
addition scoped to its own spec.
