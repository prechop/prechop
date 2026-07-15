# 01 — Domain Model & Glossary

The Final PRD (v3.0, "Approved for Engineering") is the authoritative product source. Where v2
and the Final PRD disagree, the Final PRD wins (the resolution table is in
`03-business-rules.md`).

## The two-sided marketplace

```
        ┌──────────┐        publishes        ┌──────────────┐
        │  VENDOR  │ ──────────────────────► │  DAILY ORDER │  (a dated listing, with cutoff)
        └──────────┘                         └──────┬───────┘
             ▲                                      │ contains snapshotted
             │ reviews / analytics                  ▼
             │                               ┌──────────────┐
        ┌──────────┐        places           │ BUYER ORDER  │  (paid, cooked, fulfilled)
        │  BUYER   │ ──────────────────────► └──────┬───────┘
        └──────────┘                                │ settled via
             ▲                                      ▼
             │ scoped to                     ┌──────────────┐
        ┌──────────┐                         │   PAYMENT    │  (Paystack split)
        │  CAMPUS  │◄──── everything ────────└──────────────┘
        └──────────┘
```

## Core entities

| Entity | One-line definition |
|---|---|
| **Campus** | A university location; the top-level tenancy boundary. Everything is scoped to a campus. |
| **School** | A reference list of Nigerian institutions used for a vendor's on-campus location. |
| **User** | A person identified by phone number. Role is `BUYER`, `VENDOR`, or `SUPER_ADMIN`. |
| **VendorProfile** | A user's seller identity: business info, location, categories, bank/Paystack subaccount, ratings, completeness. |
| **MenuItem** | A reusable catalog dish for a vendor (name, category, price, prep time, images). |
| **TimetableEntry** | Which menu items a vendor cooks on which day of the week. |
| **DailyOrder** | A published, dated listing with a cutoff time and a shareable link; contains snapshotted items. |
| **DailyOrderItem** | A snapshot of a menu item inside a daily order, with optional quantity cap and addons. |
| **BuyerOrder** | A buyer's placed order against a daily order; carries fulfillment, totals, and status. |
| **BuyerOrderItem** | A snapshot of a chosen item within a buyer order, with quantity and addons. |
| **Payment** | The Paystack transaction for a buyer order, with split amounts and idempotency. |
| **Refund** | A reversal of a payment. |
| **Review** | A buyer's 1–5 rating + tags for a completed order. |
| **Notification** | An in-app message to a user (also fanned out to SMS/email/push). |
| **AuditLog** | An append-only record of a state-changing action. |
| **AnalyticsSnapshot** | A daily per-vendor aggregate; all analytics read from these, never live. |
| **WhatsappTv** | A campus WhatsApp broadcast channel a vendor can contact to promote a listing. |

## Roles & capabilities

### Buyer (student / staff / community — not restricted to students)
- Browse the campus-scoped marketplace; view vendor profiles (badges, timetable, reviews).
- Open a shared order link (`/o/{shareableToken}`).
- Place an order (items + quantities + addons), choose pickup/delivery, pay via Paystack.
- Cancel own order (only `PAID`/`CONFIRMED`); view order history; "Order Again".
- Submit a review (own completed orders only, within 72h).

### Vendor (all types share identical permissions; `vendorType` is a cosmetic tag)
- Complete onboarding (business identity, location, categories, image, bank details).
- Manage a reusable menu; set a weekly timetable.
- Publish daily orders (from scratch or a timetable template); update, close, cancel own listings.
- Run "cooking mode": advance order statuses through the fulfillment pipeline.
- View own orders and analytics; report reviews on own profile.
- Browse the campus WhatsApp-TV directory ("Boost Your Order").
- **Cannot** place orders.

### Super Admin (platform owner)
- Manage campuses and schools.
- List/inspect all vendors; suspend/reactivate (audited, blocks login).
- View all orders; view platform-wide analytics.
- Moderate reviews (view flagged, remove, unflag).
- Manage WhatsApp-TV directory entries per campus.
- Tune runtime policy via `siteConfigs` (fees, flags, kill switches).

## Ubiquitous glossary

| Term | Meaning |
|---|---|
| **Kobo** | The Nigerian currency subunit. ₦1 = 100 kobo. All money is stored as integer kobo. |
| **Cutoff time** | The vendor-set deadline after which a daily order accepts no new buyer orders. |
| **Daily order** | A vendor's listing for a specific date — the thing buyers order *against*. |
| **Buyer order** | A single buyer's order placed against a daily order. |
| **Shareable token** | The opaque slug in a daily order's public link (`/o/{token}`). |
| **Snapshot** | A frozen copy of a menu item's name/price/image at publish or order time. |
| **Slot** | A remaining unit of a quantity-capped item (`maxQuantity − orderedQuantity`). |
| **Slot lock** | A Redis `SET NX` hold (10-min TTL) reserving a slot during pending payment. |
| **Profile completeness** | A 0–100 **display score**. It gates nothing — marketplace visibility requires **admin approval** (BR-15/BR-16). |
| **Onboarding checklist** | The steps an applicant can complete pre-approval (phone, business name, category, location, bank/subaccount, image). Completing it unlocks **Submit for review**, not go-live. |
| **Subaccount** | A vendor's Paystack account that receives its split of each payment — settled **directly** by Paystack. Prechop never holds vendor money. |
| **Platform fee** | Prechop's cut: **3% of the food subtotal from the buyer (capped ₦200) + 8% from the vendor**, per order. *(Corrected 2026-07-15 — the old "₦50 + ₦100 flat" was never implemented. See BR-4 / ADR-004a.)* |
| **Cooking mode** | The vendor screen listing paid orders to prepare, with per-item/addon totals. |
| **Marketplace** | The campus feed of active daily orders, sorted cutoff-soonest-first. |
| **WhatsApp TV** | A campus broadcast channel; vendors pay (off-platform in Phase 1) to promote listings. |

## Bounded contexts (module map)

Auth · Users · Vendors · Menu · Timetable · Daily-Orders · Buyer-Orders · Payments · Reviews ·
Notifications · Analytics · Admin · WhatsApp-TV. Each is a folder under `src/server/services` with
matching models and validators — a modular monolith that can later extract Orders/Payments into
their own services.
