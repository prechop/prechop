# 03 — Business Rules Catalog

The canonical, testable rules. Each has an ID (`BR-n`) for cross-reference from tests and code.

## Money & pricing

- **BR-1 — Integer kobo.** All monetary values are integers in kobo (₦1 = 100 kobo). No floats
  anywhere. Naira is display-only (`koboToNaira`, `formatKobo`).
- **BR-2 — Server-side pricing.** Clients send only item IDs, quantities, and selected addon IDs.
  The server fetches every price and computes subtotal/fees/total. A client-sent price is ignored.
- **BR-3 — Snapshots freeze price.** A `DailyOrderItem` snapshots its menu item at publish; a
  `BuyerOrderItem`/addon snapshots at order time. Later menu edits never change a published listing
  or a placed order.
- **BR-4 — Platform fee.** Prechop takes **₦50 from the buyer** (added as a visible line item at
  checkout) **+ ₦100 from the vendor** (deducted from settlement) per order — `5000` / `10000`
  kobo, sourced from `siteConfigs`. `vendorAmountKobo = subtotal + deliveryFee − vendorFee`
  (floored at 0). (Resolves the source discrepancy — see ADR-004.)
- **BR-5 — Delivery fee.** Set per daily order, uniform for all buyers on that listing; `0` shows a
  "Free Delivery" badge. Collected in the single Paystack payment and settled to the vendor. It is
  fully refundable if the order is cancelled before `PREPARING`; non-refundable once `PREPARING`.

## Cutoff & time windows

- **BR-6 — Hard cutoff at write time.** The API rejects any order placed at or after
  `cutoffTime` with `CUTOFF_PASSED`. This is the single source of truth. (Client countdown UI is
  cosmetic.)
- **BR-7 — Cutoff sweep (reconciler).** A 1-minute cron closes `ACTIVE` daily orders past cutoff,
  auto-cancels+refunds any `PAID`-but-unconfirmed buyer orders, and SMS-notifies the vendor. It is
  a reconciler, not the enforcer — BR-6 already prevents late orders.
- **BR-8 — Cutoff warning.** 30 minutes before cutoff (configurable), buyers get an in-app notice
  and the vendor an SMS.
- **BR-9 — Cutoff change.** A vendor may change `cutoffTime` after orders exist; all already-paid
  buyers are notified by SMS.
- **BR-10 — Order window.** An order is valid only when `scheduledDate ≤ now < cutoffTime` and the
  daily order is `ACTIVE`.

## Slots & concurrency

- **BR-11 — Optional quantity cap.** `maxQuantity` per daily-order item (null = unlimited).
- **BR-12 — Slot hold.** On order creation, a Redis `SET NX slot:lock:{itemId}:{orderId}` (TTL
  10 min, `siteConfigs.slotHoldTtlSeconds`) atomically checks `maxQuantity − orderedQuantity` and
  holds the slot. Losers get a friendly `SLOT_UNAVAILABLE`.
- **BR-13 — Locks persist through payment.** After a successful Paystack init, slot locks are
  **not** released — they hold for the TTL until the webhook confirms payment (then
  `orderedQuantity` is incremented) or the order is abandoned.
- **BR-14 — Abandoned release.** A 5-minute cron cancels `PENDING_PAYMENT` orders older than 15
  minutes whose payment is still `INITIALIZED`, and clears their lingering slot locks.

## Vendor lifecycle & visibility

- **BR-15 — Completeness gate.** A vendor is invisible on the marketplace until
  `profileCompleteness = 100`. Weights: phone verified 10, profile photo 15, ≥1 category 10, ≥3
  menu items 25, timetable ≥1 day 15, bank details/subaccount 25.
- **BR-16 — Auto-activation.** At 100% completeness the vendor auto-transitions `INCOMPLETE →
  ACTIVE`. **No manual approval gate** (Final PRD supersedes v2's manual `verified` flag).
- **BR-17 — Open toggle.** `isOpenForOrders` can only be turned on when status is `ACTIVE`.
- **BR-18 — Active to publish.** Only `ACTIVE` vendors can create daily orders.
- **BR-19 — Bank details from Paystack.** The account name is resolved via Paystack and stored
  from Paystack's response — never the client-typed value. A Paystack subaccount is created with
  `percentage_charge 0` (split is controlled per transaction).
- **BR-20 — Suspension.** Suspending a vendor sets `SUSPENDED` **and** deactivates the linked user
  (blocks login), emails the vendor, and writes an audit log. Reactivation reverses it (audited).

## Menu & timetable

- **BR-21 — Ownership.** Every menu/timetable mutation re-verifies the item belongs to the caller
  (404 if missing, 403 if another vendor's). Bulk operations validate **all** IDs before applying any.
- **BR-22 — Soft delete.** Menu items are soft-deleted (`deleted:true`); historical orders keep
  their snapshots regardless.
- **BR-23 — Addons on MEALS only.** Addons/extras may attach only to `MEALS`-category items.
- **BR-24 — Naira input → kobo.** Menu/daily-order prices are entered in Naira and converted to
  kobo at the service boundary.

## Campus scoping (multi-tenancy)

- **BR-25 — Scoped visibility.** Buyers see only vendors/daily-orders in their selected campus.
  Off-campus buyers see vendors near their campus, not the whole platform.
- **BR-26 — Explicit scoping.** `campusId` is on every scoped document and included in every
  scoped query. There is no global scoping magic; each `*DB` function filters explicitly.
- **BR-27 — Campus switch.** A buyer may switch campus (`PATCH /users/me/campus`) only to a campus
  that exists and is active.

## Orders, payments, refunds

- **BR-28 — Idempotent webhook.** A duplicate Paystack event returns 200 and no-ops
  (`webhookVerified` flag + unique `idempotencyKey`).
- **BR-29 — Amount verification.** The webhook amount is asserted against `payment.amountKobo`
  before marking paid.
- **BR-30 — Transactional creation.** The buyer order + items + addons + payment are written in one
  Mongo transaction (replica set required).
- **BR-31 — Cancellation window.** Buyer/vendor cancel is allowed only from `PAID` or `CONFIRMED`;
  it triggers an automatic Paystack refund. A failed refund is logged and surfaced, never silently
  swallowed. No cancel/refund from `PREPARING` onward.
- **BR-32 — Vendor cancel notifies buyer.** A vendor cancellation requires a reason and SMS-notifies
  the buyer with refund info.

## Reviews

- **BR-33 — Reviewable when completed.** Only `COMPLETED` orders can be reviewed, one review per
  order (`REVIEW_ALREADY_EXISTS` otherwise).
- **BR-34 — Review window.** 72 hours from the order's completion (`REVIEW_WINDOW_EXPIRED`).
- **BR-35 — Immutable.** Reviews can't be edited after submission.
- **BR-36 — Rating hidden until proven.** A vendor's numeric rating is hidden until ≥5 completed
  reviews; a "New Vendor" badge shows instead.
- **BR-37 — Report flags only.** A vendor "report" flags a review (rating unchanged — prevents
  gaming); admin removal recomputes the rating.

## WhatsApp TV (Phase 1)

- **BR-38 — Campus-scoped, read-only.** Vendors see only `isActive` TVs for their own campus,
  ordered by `displayOrder`.
- **BR-39 — Never expose the raw number.** The API returns a server-built `https://wa.me/{number}`
  URL, never the raw `whatsappNumber` (which is stored encrypted).
- **BR-40 — Soft delete only.** TV entries are deactivated (`isActive:false`), never hard-deleted
  (Phase-2 migration safety). Number validated `^234[789]\d{9}$`, `+` stripped.

## Audit & notifications

- **BR-41 — Append-only audit.** Every state-changing admin/vendor action is logged with
  previous/new state, **server-resolved IP** (never client-trusted), and user agent. No updates/deletes.
- **BR-42 — Async, non-blocking notifications.** Notifications are dispatched fire-and-forget; a
  failure never breaks the request that triggered them.

## Known gaps (documented, not built)

- **Disputes.** The Final PRD references dispute resolution but ships no data model; v2 had a
  `Dispute` entity. Recommended minimal model: `disputes { buyerOrderId, openedBy, status
  (OPEN|INVESTIGATING|RESOLVED), reason, resolution?, createdAt }` with an admin queue. Not in
  current scope — flagged for a future spec.
- **Pickup code.** v2 used a 4-digit pickup code; the Final PRD drops it (buyer presents the order
  number, vendor taps `COMPLETED`). We follow the Final PRD.
