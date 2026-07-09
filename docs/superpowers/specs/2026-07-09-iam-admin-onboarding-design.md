# IAM Permissions, Admin Dashboard & Vendor Onboarding Gate — Design

Date: 2026-07-09
Status: Approved (proceeding to implementation)

## Goal

Replace PreChop's fixed 3-value role enum with an AWS-IAM-style permission system
(managed policies attached to groups and/or users — **no inline policies**), build a
full-fledged admin dashboard to manage all platform data, and gate new-vendor
registration behind explicit admin review.

## Decisions (from brainstorming)

1. **Permission model:** AWS-like action/resource policies. Statements carry
   `effect (Allow|Deny) + actions[] + optional resources[]/condition`. **Explicit
   Deny beats Allow beats implicit-deny.**
2. **Scope:** Unified — the `UserRole` enum is retired. **Pure groups, no `type`
   field.** "Is a vendor?" derives from membership in the built-in **Vendors** group
   (and/or `vendorProfile` existence). Every authorization decision flows through the
   policy engine.
3. **Onboarding gate:** `INCOMPLETE → PENDING_REVIEW → ACTIVE | CHANGES_REQUESTED`
   with reject-reason + resubmit loop, fully audited. The old auto-promotion on
   completeness threshold is removed.
4. **Dashboard modules:** existing 8 sections + IAM (Users/Groups/Policies) +
   Onboarding review queue + Menu/catalog + Payments/refunds + Audit-log viewer +
   Analytics + Notifications.
5. **Delivery:** 4 phases, each ending green (build + unit + e2e); QA via
   `full-stack-validation` in Phase 4.

## Architecture: enforcement engine (Approach B)

Per-route `requirePermission(auth, action, resource?)` helper, a drop-in evolution of
the existing `assert*` guards. `withAuth` resolves the caller's **effective permission
set** once per request (extending `resolveScope`), **cached in Redis** keyed by
`user:{id}:permv:{permVersion}`; `permVersion` is a global counter bumped on any
group/policy/user-attachment change, invalidating all caches cheaply. Node runtime
(Mongo access), authz lives next to the logic it guards.

## Section A — Data model

New Mongoose models under `src/server/models/<name>/{index,types}.ts`, following the
existing `campuses` template (aggregate reads with `id` projection, timed writes,
`databaseResponseTimeHistogram`).

### `policies` (managed policy)
- `name` (unique), `description`, `isBuiltIn` (bool), `statements[]`, `deleted`, ts.
- statement: `{ effect: "Allow"|"Deny", actions: string[], resources?: string[],
  condition?: Record<string,string> }`.
- Built-in policies are protected from edit/delete (`isBuiltIn` guard in service).

### `groups`
- `name` (unique), `description`, `policyIds: ObjectId[]`, `isBuiltIn`, `deleted`, ts.

### `iamMeta` (singleton)
- `{ permVersion: number }` — global cache-buster. `bumpPermVersion()` on any change.

### `users` (modified)
- **Remove** `role`. **Add** `groupIds: ObjectId[]`, `directPolicyIds: ObjectId[]`.
- Backfill: existing SUPER_ADMIN → Administrators group; VENDOR → Vendors; BUYER →
  Buyers (migration script + seed).

### Action catalog (code, not DB) — `src/server/constants/permissions.ts`
Enumerated `resource:action` strings, grouped for the policy-editor UI. Examples:
`vendor:read|approve|reject|suspend|reactivate|update`,
`onboarding:read|approve|reject`,
`order:read|cancel|update`, `menu:read|update|takedown`,
`payment:read|refund`, `refund:read|create`,
`campus:read|create|update`, `school:read|create|update`,
`review:read|moderate`, `siteConfig:read|update`, `whatsappTv:read|manage`,
`analytics:read`, `notification:send`, `audit:read`,
`iam:user:read|update|attach`, `iam:group:*`, `iam:policy:*`.
`*` wildcard (and `resource:*`) supported for the Administrators policy.

### Built-in seed
- **Policies:** `AdministratorFullAccess` (`Allow *`), `VendorBaseAccess`
  (vendor self-management actions), `BuyerBaseAccess` (browse/order actions),
  `VendorOnboardingManager`, `FinanceManager`, `SupportAgent` (read + moderate).
- **Groups:** `Administrators`→[AdministratorFullAccess], `Vendors`→[VendorBaseAccess],
  `Buyers`→[BuyerBaseAccess], plus staff groups `OnboardingReviewers`, `Finance`,
  `Support`.
- Registration assigns Buyers/Vendors group. Seed admin joins Administrators.

## Section B — Policy engine

`src/server/services/iam/`:
- `resolvePermissions(userId)` → gathers group policies + direct policies → returns
  `{ statements, version }`. Cached in Redis under `permVersion`.
- `can(statements, action, ctx?)` → boolean with Deny-override, wildcard match,
  resource/condition eval (`$user.campusId` substitution).
- `requirePermission(auth, action, ctx?)` (in `lib/auth.ts`) throws `ErrForbidden`.
- `AuthResult` gains `permissions` (resolved statements) + `groups` (names, for audit
  label) and drops `role`. `assertAdmin/Vendor/Buyer` are replaced by
  `requirePermission` at all 68 call-sites; a temporary `isVendorGroup(auth)` helper
  covers the few "is a vendor at all" branches.
- Audit `role` field is repurposed to a group-label snapshot string.

## Section C — Migration of guard sites

68 files. Mechanical mapping table (assert → permission). `withAuth` unchanged in
shape; only its resolved `auth` payload changes. Client `UserRole` type removed;
`PublicUser` gains `groups: string[]` + `permissions: string[]` so the UI can
show/hide admin nav and actions. `useAuth` exposes `can(action)`.

## Section D — Vendor onboarding gate

- `VendorStatus` gains `PENDING_REVIEW`, `CHANGES_REQUESTED`. `vendorProfiles` gains
  `submittedAt`, `reviewedAt`, `reviewedBy`, `rejectionReason`, `reviewNotes`.
- `recomputeVendorCompleteness` no longer auto-activates; it only maintains the score.
- New vendor endpoints: `POST /api/vendors/me/submit` (INCOMPLETE|CHANGES_REQUESTED →
  PENDING_REVIEW, requires completeness threshold), read-only lock while PENDING_REVIEW.
- New admin endpoints under `/api/admin/onboarding`: list queue, get submission (all
  attached details), `approve` (→ ACTIVE + welcome email), `reject` (reason →
  CHANGES_REQUESTED + email). All gated by `onboarding:*`, audited.
- Vendor dashboard shows submission status + rejection feedback; selling
  (daily-orders create) stays blocked until ACTIVE.

## Section E — Admin dashboard

New routes under `src/app/admin/*` + wrappers in `src/libs/*`, mirroring existing
`Admin*Wrapper` pattern. Nav gated by permissions:
- **IAM:** Users (list/detail, attach groups & policies), Groups (CRUD, attach
  policies), Policies (CRUD with a statement editor + action-catalog picker).
- **Onboarding:** review queue + submission detail with approve/reject.
- **Catalog:** cross-vendor menu browse + takedown.
- **Payments & refunds:** transactions list, refund issue/track.
- **Audit log viewer:** filter by actor/action/resource/date.
- **Analytics & notifications:** platform KPIs + broadcast/targeted send.
Every admin API guarded by `requirePermission`; AdminShell nav filtered by `can()`.

## Section F — Safety rails

- Cannot delete/empty the Administrators group or its policy; cannot remove the last
  Administrator; a user cannot strip their own admin access (lock-out guard).
- Built-in policies/groups immutable (name + `isBuiltIn`).
- All IAM mutations audited (`iam:*` actions) with before/after state.

## Section G — Testing & validation

- Unit (vitest): policy engine (`can`, Deny-override, wildcard, conditions),
  resolvePermissions caching/invalidation, onboarding state machine, each new service.
  Target ≥95% on new/changed server code.
- e2e (Playwright): admin logs in → reviews vendor → approves/rejects; vendor submits &
  sees status; permission-denied path for a limited staff account; IAM CRUD.
- Phase 4 runs `full-stack-validation`: seed realistic data, drive every admin + vendor
  route, security review (lock-out, privilege escalation, IDOR on admin APIs), fix,
  deploy verdict.

## Section H — Phasing

1. **IAM core** — models, engine, seed, migrate 68 guards, client wiring. Green.
2. **Onboarding gate** — status machine, vendor submit, admin review APIs. Green.
3. **Dashboard** — all admin modules + nav gating. Green.
4. **QA** — full-stack-validation pass + fixes → production-ready verdict.

## Section I — Bug reports & feature requests (folded in)

Reported issues, mapped to phases. Items marked ⭑ are covered by the core IAM /
onboarding work; the rest are additional app fixes.

| # | Item | Phase | Notes |
|---|------|-------|-------|
| 2 ⭑ | Buyer gets 403 on `POST /api/orders` | 1 | Ensure `buyer:order:create` is granted by BuyerBaseAccess and the route requires it, not a vendor/mismatched guard. |
| 13 ⭑ | Vendor stuck INCOMPLETE, can't create menu/go live | 2 | Completeness must reach 100 after all steps; menu creation must NOT be gated on ACTIVE status; going live gated on approval. |
| 18 ⭑ | Admin can't see new vendor registrations / no approval flow | 2/3a | Onboarding review queue + approve/reject; vendor hidden from marketplace until ACTIVE (approved). |
| 1 | Extras/add-ons only for Meals category | 3b | Conditionally render extras UI (vendor menu builder + buyer order page) only when `category === MEALS`; hide otherwise. Enforce server-side too. |
| 7 | Vendor settings page at `/vendor/settings` | 3b | Edit profile, account details, location, bank details, notification prefs, delivery defaults (fields per PRD). |
| 8 | New-order form prefill from today's timetable + disable past dates | 3b | Detect current day, prefill timetable items; greyed/disabled past dates in picker. |
| 9 | Share prompt after publishing order | 3b | Success screen: confirmation, shareable link, copy button, WhatsApp + Telegram share. |
| 10 | WhatsApp TV entries not showing on vendor dashboard | 3b | Verify entries saved `isActive:true` + campus match; fix `GET /api/vendors/whatsapp-tvs` filter. |
| 11 | Menu section styling & functionality | 3b | Rework menu list, category grouping, add-item form, availability/sold-out toggles, extras — consistent with dashboard design. |
| 12 | Bank account name shown after Paystack verify | 3b | Show verified account name pre-submit; submit disabled until verified; clear error on failure. |
| 16 | "Open for Orders" toggle unresponsive | 3b | Wire to `PATCH /api/vendors/me/open-status`; update local state on success. |
| 17 | Placed/paid buyer orders not on vendor dashboard | 3b | Report says "Supabase Realtime" but stack is Mongo/SWR — fix order persistence with correct `vendorId` + vendor feed refresh (SWR revalidate / poll). |
| 3 | OTP verify hangs on 401 | 3c | Frontend must stop loader and show "Invalid or expired code, please try again." on 401. |
| 4 | Split background flash on load (SSR) | 3c | Fix styled-components registry SSR flush so styles land before first paint. |
| 5 | Dark/light toggle icon missing | 3c | Add theme toggle (top nav) driving `data-theme`. |

## Non-goals (YAGNI)

- No inline policies, no policy versioning/rollback, no SCP/permission-boundary tiers,
  no time-based/session policies, no external IdP/SSO. Buyer/vendor app flows keep
  their current UX; only the authorization substrate changes.
