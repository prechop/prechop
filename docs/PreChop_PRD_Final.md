# PreChop — Product Requirements Document

### "Order Before They Cook"

**Version:** 3.0 — Final  
**Last Updated:** June 2026  
**Author:** Aramide Jamiu Kolawole  
**Status:** Approved for Engineering

---

## Table of Contents

1. [Product Overview](#1-product-overview)  
2. [Brand Identity](https://docs.google.com/document/d/14ydQy9k6HBQsWnfzdjVLlc2Bt5ZMzjpptp9_P_QWEJo/edit#2-brand-identity)  
3. [Target Users](#2-target-users)  
4. [Core Value Proposition](#3-core-value-proposition)  
5. [System Architecture](#4-system-architecture)  
6. [Technology Stack](#5-technology-stack)  
7. [Data Model](#6-data-model)  
8. [User Roles & Permissions](#7-user-roles--permissions)  
9. [Feature Specifications](#8-feature-specifications)  
   - 8.1 [Authentication & Registration](#81-authentication--registration)  
   - 8.2 [Vendor Dashboard](#82-vendor-dashboard)  
   - 8.3 [Menu Builder](#83-menu-builder)  
   - 8.4 [Timetable / Schedule System](#84-timetable--schedule-system)  
   - 8.5 [Order Creation by Vendor](#85-order-creation-by-vendor)  
   - 8.6 [Marketplace / Discovery](#86-marketplace--discovery)  
   - 8.7 [Buyer Order Flow](#87-buyer-order-flow)  
   - 8.8 [Fulfillment — Pickup & Delivery](#88-fulfillment--pickup--delivery)  
   - 8.9 [Payment Flow](#89-payment-flow)  
   - 8.10 [Order State Machine](#810-order-state-machine)  
   - 8.11 [Notifications](#811-notifications)  
   - 8.12 [Ratings & Reviews](#812-ratings--reviews)  
   - 8.13 [Digital Receipts](#813-digital-receipts)  
   - 8.14 [Super Admin Panel](#814-super-admin-panel)  
   - 8.15 [Analytics](#815-analytics)  
10. [Security Design](#9-security-design)  
11. [Scalability Plan](#10-scalability-plan)  
12. [Development Phases](#11-development-phases)  
13. [Open Decisions Log](#12-open-decisions-log)

---

## 1\. Product Overview

PreChop is a food pre-order marketplace scoped to university campuses and their surrounding areas. It allows buyers to discover vendors — student cooks, canteen stalls, and nearby restaurants — browse structured menus, and place orders **before food is prepared**.

The tagline **"Order Before They Cook"** captures the core mechanic: cutoff-based ordering windows that protect both sides of the transaction. Vendors cook only what was ordered — zero waste, exact quantities. Buyers get fresh, prepared-on-demand food and never arrive to an empty pot.

### Two Discovery Paths for Every Order

**Path A — Link Sharing (Warm Audience)** Vendor creates a daily order → system generates a unique shareable link → vendor distributes via WhatsApp, Telegram, or any channel → buyer clicks link and orders without needing to search.

**Path B — Marketplace Discovery (Cold Audience)** Buyer opens PreChop → browses active vendors in their campus scope → sees live orders available today or previewed for the week → orders from any vendor without needing the link.

Both paths produce the same order. Together they maximise vendor order volume with no extra effort from the vendor.

---

## 2\. Brand Identity

### Name

**PreChop** — from Nigerian Pidgin: *"chop"* means to eat. *"Pre"* signals the pre-order mechanic. Direct, fun, accurate.

### Tagline

*"Order before they cook."*

### Voice & Tone

| Context | Tone | Example |
| :---- | :---- | :---- |
| Vendor onboarding | Warm, encouraging | "You're almost set\! Add your bank details so we can send your money." |
| Order page | Appetizing, urgent | "15 plates left. Order now before it sells out." |
| Confirmation | Celebratory, clear | "You're in\! Your Jollof Rice is confirmed. Show code **4821** when you arrive." |
| Cutoff reached | Honest, soft | "Sorry, orders for this meal are closed. Follow this vendor to catch the next one." |
| Error states | Direct, helpful | "That didn't work. Try again or use a different card." |
| Empty states | Playful | "No orders yet. Share your link on Status and watch them roll in." |
| Delivery confirmed | Warm, clear | "On the way\! Amaka is bringing your order to you. She'll call when she's close." |

### Color Palette

Primary Green   \#1B8A4C   — trust, food, Nigeria

Accent Orange   \#F47C20   — energy, appetite, urgency

Off White       \#FAF9F6   — background, warmth

Dark            \#1A1A1A   — text

Muted           \#6B7280   — secondary text

Success         \#16A34A   — confirmations, paid states

Warning         \#CA8A04   — cutoff warnings, low stock

Danger          \#DC2626   — errors, failed payments

### Typography

Display / Headers   — Clash Display (Google Fonts) — bold, modern

Body / UI           — Inter — clean, readable on small screens

Monospace           — JetBrains Mono — pickup codes, amounts

### Logo Concept

A bowl of jollof rice with a clock hand — food \+ time \= pre-order. Simple enough to work as a WhatsApp profile icon at 40×40px.

## 2\. Target Users

### Buyers

Anyone who wants to order food — not restricted to students. Buyers can be on-campus students, off-campus residents, staff, or anyone within the vendor's service area.

### Vendors

All vendors share the same structure and permissions. A cosmetic **vendor type tag** is selected during signup for display purposes only — it does not change features, permissions, or flow.

| Vendor Type Tag | Example |
| :---- | :---- |
| Student Cook | Cooks from hostel room or designated spot |
| Campus Stall | Fixed canteen or food stall inside campus |
| Restaurant | Commercial kitchen on or near campus |
| Bakery | Baked goods and snack seller |

Vendor location is either **on-campus** (linked to a school and hostel/stall) or **off-campus** (state \+ area address). Both types serve buyers scoped to the same campus zone.

### Super Admin

The platform owner. Full visibility and control over all campuses, vendors, buyers, orders, and platform settings.

**The three roles are: `BUYER`, `VENDOR`, `SUPER_ADMIN`. No other roles exist.**

---

## 3\. Core Value Proposition

### For Buyers

- Discover all vendors in their campus area in one place  
- See full menus, weekly timetables, ratings, and live availability  
- Order ahead — food is guaranteed before the vendor starts cooking  
- Pay securely via card or bank transfer through Paystack  
- Choose pickup or delivery per order  
- Receive digital receipts and full order history  
- "Order Again" shortcut for repeat purchases

### For Vendors

- Structured menu builder — set up once, reuse every day  
- Weekly timetable — buyers know what's cooking before they ask  
- One-tap daily order creation from timetable template  
- Shareable order link for WhatsApp and Telegram distribution  
- Public marketplace listing for organic discovery  
- Know exact quantities before cooking — zero food waste  
- Automated cutoff enforcement — system closes orders on time  
- Secure Paystack payments with direct subaccount settlement  
- Real-time order dashboard with live incoming orders via Supabase Realtime  
- Vendor analytics: revenue, top items, peak hours, ratings

---

## 4\. System Architecture

### Pattern: Modular Monolith → Microservices-Ready

The MVP ships as a well-structured modular monolith. Every domain is a self-contained module with its own routes, services, and data access layer. Clear module boundaries mean individual domains can be extracted into independent services in future without a rewrite.

┌─────────────────────────────────────────────────────────────────┐

│                        CLIENT LAYER                             │

│     Buyer PWA (Mobile-first)  |  Vendor Dashboard  |  Admin UI │

└──────────────────────────────┬──────────────────────────────────┘

                               │ HTTPS

┌──────────────────────────────▼──────────────────────────────────┐

│                          API LAYER                              │

│           Fastify \+ Rate Limiting \+ Auth Hooks                  │

│           Zod Schema Validation \+ Pino Logging                  │

└──────────────────────────────┬──────────────────────────────────┘

                               │

┌──────────────────────────────▼──────────────────────────────────┐

│                    APPLICATION MODULES                          │

│                                                                 │

│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │

│  │   Auth   │ │ Vendors  │ │   Menu   │ │  Orders  │          │

│  │ Identity │ │ Profiles │ │ Catalog  │ │  \+ FSM   │          │

│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │

│                                                                 │

│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │

│  │ Payments │ │  Notifs  │ │ Reviews  │ │Analytics │          │

│  │Paystack  │ │ BullMQ   │ │ Ratings  │ │Snapshots │          │

│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │

└──────────────────┬──────────────────────┬───────────────────────┘

                   │                      │

   ┌───────────────▼────────┐  ┌──────────▼──────────────┐

   │  PostgreSQL via        │  │  Redis (ioredis)         │

   │  Supabase \+ Prisma     │  │  Sessions, Rate Limits   │

   │  Row Level Security    │  │  BullMQ Queue Backend    │

   │  Realtime (WebSocket)  │  │  Soft Quantity Locks     │

   └───────────────┬────────┘  └──────────┬──────────────┘

                   │                      │

   ┌───────────────▼──────────────────────▼───────────────┐

   │                   AWS Infrastructure                  │

   │  S3 (Images, Receipts)  |  CloudFront CDN            │

   │  ECS Fargate (API)      |  CloudWatch (Monitoring)   │

   │  AWS Secrets Manager    |  Sentry (Error Tracking)   │

   └───────────────────────────────────────────────────────┘

### Real-Time Layer

Supabase Realtime handles live order status updates to the vendor dashboard via WebSocket on Postgres change events. No Socket.io required. The API serves REST; Supabase Realtime handles the push layer.

### Background Jobs (BullMQ \+ Redis)

All async work is queue-driven. The API never blocks waiting for side effects.

| Job | Trigger | Action |
| :---- | :---- | :---- |
| `cutoff.enforce` | Scheduled at order publish time | Auto-cancel \+ refund unconfirmed orders at cutoff |
| `cutoff.warning` | 30 min before cutoff | Notify buyer and vendor |
| `notification.dispatch` | Any order state change | Route to SMS and email channels |
| `receipt.generate` | Order reaches COMPLETED | Generate PDF → upload to S3 → send link |
| `analytics.aggregate` | Daily at midnight | Compute vendor snapshots from raw order data |

### Two Separate Node.js Processes

- **API Process** — handles all HTTP traffic. Stateless. Scales horizontally.  
- **Worker Process** — handles all BullMQ background jobs. Scales independently. A slow background job never blocks an API request.

---

## 5\. Technology Stack

> **⚠️ CORRECTED (2026-07-15) — this table described a stack that was never built.**
> The table below is the **as-built** stack. The originally specified Fastify \+ PostgreSQL/Supabase
> \+ Prisma \+ BullMQ \+ Termii stack was replaced during the merge; the old column is kept in the
> "Originally specified" column so the reversal is traceable rather than silently rewritten.
> Three consequences are load-bearing and are spelled out under the table — read them before
> designing against this section.

| Layer | Technology (as built) | Originally specified | Decision |
| :---- | :---- | :---- | :---- |
| Runtime | Node.js 20 LTS \+ TypeScript 5 (strict mode) | *(unchanged)* | Strong typing, async I/O |
| Framework | **Next.js 16 (App Router)** — API routes \+ SSR in one app | Fastify | One deployable, one auth context, no cross-service API contract to keep in sync |
| Database | **MongoDB** | PostgreSQL via Supabase | See ADR-001 |
| ORM | **Mongoose** | Prisma | See `docs/data-and-api/04-prisma-to-mongoose-migration.md` |
| Realtime | **SWR polling (10–20s per surface)** | Supabase Realtime | See consequence 2 below |
| Cache & Sessions | Redis (ioredis) | *(unchanged, minus BullMQ)* | OTP storage, refresh tokens, rate-limit counters, slot holds, cron locks |
| Job Queue | **`node-cron` sweeps** (`src/server/constants/cron.ts`) | BullMQ | See consequence 1 below · ADR-002 |
| File Storage | AWS S3 | AWS S3 \+ CloudFront | Menu images and receipts — private bucket, per-request signed URLs |
| Auth | Phone \+ OTP (**Sendchamp**) → JWT **HS256** (15 min) \+ refresh token (30 days) | Termii · JWT RS256 | No passwords — OTP only. Two distinct HS256 secrets. See ADR-003 |
| Payments | Paystack | *(unchanged)* | Subaccounts for direct vendor settlement |
| SMS | **Sendchamp** | Termii | Nigerian SMS gateway — OTP delivery |
| Email | Resend | *(unchanged)* | Transactional email — receipts, registration confirmation |
| Input Validation | Zod | *(unchanged)* | Schema validation at route level and inside service layer |
| Row-Level Security | **None — app-layer only** | Postgres RLS | See consequence 3 below |
| Error Tracking | Sentry | *(unchanged)* | Full context on errors — userId, orderId, route |
| CI/CD | GitHub Actions (`.github/workflows/ci.yml`) | *(unchanged)* | Lint → type-check → test → build |

**Three consequences of the stack change that carry product weight:**

1. **Delayed jobs became cron sweeps.** There is no per-order delayed job. Everything that was a
   BullMQ delayed job is now a periodic sweep on a fixed schedule, guarded by a Redis single-instance
   lock: cutoff close (1 min), abandoned-order sweep (5 min), `cutoff.enforce` (5 min), cutoff warning
   (1 min), sold-out reset and analytics (Lagos midnight / 00:01). **Timing is therefore approximate,
   not exact** — an action due "at cutoff" happens on the next tick after cutoff, up to 5 minutes late.
   Do not write a requirement that depends on to-the-second job timing.
2. **Supabase Realtime became SWR polling.** Live surfaces refresh on an interval (10s marketplace/
   storefront/order detail, 15s vendor dashboard & pipeline, 20s order status), not on a push. A
   vendor sees a new order within one poll, not instantly.
3. **RLS is gone.** With Postgres removed there is no database-enforced row-level security.
   **Audit-log immutability is now an application-layer convention, not a database guarantee** —
   nothing at the datastore level prevents a write path (or anyone with DB credentials) from
   altering an audit row. Any claim in this PRD that the database enforces tenancy or immutability
   is void.

---

## 6\. Data Model

All monetary values are stored as **integers in kobo** (₦1 \= 100 kobo). No floating point money anywhere in the system.

All tables carry `campusId` as a first-class indexed foreign key from day one — enabling future campus-level data partitioning with zero schema changes.

All primary keys use `cuid()` — URL-safe, collision-resistant, and non-enumerable.

---

### Enums

UserRole:         BUYER | VENDOR | SUPER\_ADMIN

VendorType:       STUDENT\_COOK | CAMPUS\_STALL | RESTAURANT | BAKERY

VendorStatus:     INCOMPLETE | ACTIVE | SUSPENDED

LocationType:     ON\_CAMPUS | OFF\_CAMPUS

MenuCategory:     MEALS | SNACKS | DRINKS | BAKED\_GOODS

DailyOrderStatus: DRAFT | ACTIVE | CLOSED | CANCELLED

OrderStatus:      PENDING\_PAYMENT | PAID | CONFIRMED | PREPARING | READY | COMPLETED | CANCELLED | REFUNDED

FulfillmentType:  PICKUP | DELIVERY

PaymentStatus:    INITIALIZED | SUCCESS | FAILED | ABANDONED | REFUNDED

DayOfWeek:        MONDAY | TUESDAY | WEDNESDAY | THURSDAY | FRIDAY | SATURDAY | SUNDAY

---

### Campus

Represents a university or polytechnic. Every vendor and buyer is scoped to a campus.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid | Primary key |
| name | String | e.g. "Ahmadu Bello University" |
| shortCode | String (unique) | e.g. "ABU" |
| state | String | Nigerian state |
| isActive | Boolean | Inactive campuses hidden from registration |
| createdAt / updatedAt | DateTime |  |

---

### User

Single table for all roles — buyer, vendor, and super admin. Role field determines what they can do.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid | Primary key |
| campusId | String (FK) | Which campus this user belongs to |
| role | UserRole | BUYER / VENDOR / SUPER\_ADMIN |
| firstName | String |  |
| lastName | String |  |
| phone | String (unique) | Primary identity — encrypted at rest |
| isPhoneVerified | Boolean | Must be true before account is usable |
| isActive | Boolean | Super admin can deactivate |
| lastLoginAt | DateTime? |  |
| createdAt / updatedAt | DateTime |  |

**Auth design note:** Login is phone \+ OTP only. No passwords. No email login. Email is collected only on the vendor profile for notification purposes, not for authentication.

---

### RefreshToken

Refresh tokens are stored as bcrypt hashes — the raw token is never persisted.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid |  |
| userId | String (FK) |  |
| tokenHash | String (unique) | bcrypt hash of the raw token |
| deviceFingerprint | String | Hash of User-Agent \+ IP — mismatched fingerprint flags compromise |
| expiresAt | DateTime | 30 days from issuance |
| usedAt | DateTime? | Null \= not yet used. Set on use. |
| revokedAt | DateTime? | Set on logout or compromise detection |
| createdAt | DateTime |  |

**Compromise detection:** If a token with a non-null `usedAt` is presented again, all refresh tokens for that user are immediately revoked and the user is forced to re-authenticate via OTP.

---

### VendorProfile

One-to-one with a User of role VENDOR. Contains all vendor-specific data.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid |  |
| userId | String (unique FK) |  |
| campusId | String (FK) |  |
| vendorType | VendorType | Cosmetic tag only — no functional difference |
| businessName | String |  |
| description | String? | Max 300 characters |
| status | VendorStatus | INCOMPLETE → ACTIVE (auto) → SUSPENDED (admin) |
| locationType | LocationType | ON\_CAMPUS or OFF\_CAMPUS |
| schoolName | String? | ON\_CAMPUS only |
| hostelOrStallName | String? | ON\_CAMPUS only |
| state | String? | OFF\_CAMPUS only |
| areaOrAddress | String? | OFF\_CAMPUS only |
| email | String (unique) | For notifications only — not for login |
| profileImageUrl | String? | S3 key |
| categories | MenuCategory\[\] | Which food categories this vendor serves |
| paystackSubaccountCode | String? | Created when bank details are submitted |
| bankName | String? |  |
| accountNumber | String? | Encrypted at rest (AES-256-GCM) |
| accountName | String? |  |
| rating | Float | Updated after each new review |
| totalReviews | Int |  |
| totalOrders | Int | Lifetime completed orders |
| completionRate | Float | % of orders completed vs cancelled |
| profileCompleteness | Int | 0–100. **Informational/display only — gates nothing.** See the correction below |
| isOpenForOrders | Boolean | Global availability toggle on vendor's profile |
| createdAt / updatedAt | DateTime |  |

> **⚠️ CORRECTED (2026-07-15) — the auto-activation gate described here was reversed.**
> The original text read: *"Vendor cannot appear in the marketplace until `profileCompleteness = 100`.
> It reaches 100 automatically when all checklist items are completed. No manual approval needed."*
> **That is no longer true and must not be restored.** Going ACTIVE requires **explicit admin
> approval**. `recomputeVendorCompleteness` no longer auto-activates anyone
> (`src/server/services/vendors/recomputeVendorCompleteness.ts`), and submission is gated on the
> onboarding checklist — **not** on `profileCompleteness >= 100`.
>
> **Why the score cannot be the gate (do not "fix" this back):** the completeness score awards 25%
> for menu items and 15% for a timetable entry. Both of those actions live behind the
> **active-vendor** gate, so an applicant cannot perform them until they are already approved.
> Gating submission on 100% therefore **deadlocked every applicant at ~60%** — they could never
> reach the score that would let them ask for the approval that would let them raise the score.
> The checklist gate exists precisely to break that deadlock.

**Vendor approval gate (as built):**

`INCOMPLETE` → *(vendor submits)* → `PENDING_REVIEW` → admin **approve** → `ACTIVE`
                                                     → admin **reject(reason)** → `CHANGES_REQUESTED` → *(vendor resubmits)* → `PENDING_REVIEW`

Submission is allowed only from `INCOMPLETE` or `CHANGES_REQUESTED`, and only when every
**onboarding checklist** step is satisfied (`onboardingChecklist` in
`src/server/helpers/completeness.ts`, enforced by `src/server/services/vendors/submitForReview.ts`):

| Checklist step | Requirement |
| :---- | :---- |
| `phone` | Phone verified |
| `identity` | `businessName` set |
| `categories` | At least one category |
| `location` | `locationType` set (OFF\_CAMPUS also needs state \+ area \+ ≥1 campus) |
| `bank` | `paystackSubaccountCode` present |
| `image` | `profileImageUrl` present |

`profileCompleteness` is still recomputed on submit for display and audit, but it does not gate
submission and does not activate the vendor. `siteConfigs.profileCompletenessRequired` (default 100)
is likewise **informational only** — no code path reads it as a gate.

**Completeness scoring:**

| Task | Points |
| :---- | :---- |
| Phone verified | 10% |
| Profile photo uploaded | 15% |
| At least one menu category selected | 10% |
| At least 3 menu items added with prices | 25% |
| Weekly timetable set (at least 1 day) | 15% |
| Bank details submitted (Paystack subaccount created) | 25% |

---

### MenuItem

Represents a single food or drink item on a vendor's menu.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid |  |
| vendorId | String (FK) |  |
| campusId | String (FK) | Indexed for campus-scoped queries |
| category | MenuCategory |  |
| name | String | e.g. "Fried Rice \+ Beef" |
| description | String? | Max 120 characters |
| price | Int | In kobo |
| imageUrl | String? | S3 key |
| estimatedPrepMin | Int | Default 20 minutes |
| isAvailable | Boolean | Vendor toggles availability |
| isSoldOut | Boolean | Vendor marks mid-day; resets automatically at midnight |
| displayOrder | Int | For drag-and-drop reorder in the menu builder |
| deletedAt | DateTime? | Soft delete — item preserved on historical order records |
| createdAt / updatedAt | DateTime |  |

---

### TimetableEntry

Represents which menu items a vendor plans to sell on which days of the week.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid |  |
| vendorId | String (FK) |  |
| menuItemId | String (FK) |  |
| dayOfWeek | DayOfWeek |  |
| isOpen | Boolean | True \= vendor is cooking this item on this day |
| createdAt / updatedAt | DateTime |  |

Unique constraint on `(vendorId, menuItemId, dayOfWeek)` — no duplicate entries.

---

### DailyOrder

A vendor-published order for a specific date. This is what buyers order from.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid |  |
| vendorId | String (FK) |  |
| campusId | String (FK) |  |
| shareableToken | String (unique, cuid) | Used in public link: `/o/{token}` |
| title | String | e.g. "Thursday Special — Semo & Egusi" |
| scheduledDate | DateTime | The date food will be ready |
| cutoffTime | DateTime | Hard deadline — no orders accepted after this |
| status | DailyOrderStatus | DRAFT → ACTIVE → CLOSED / CANCELLED |
| isPublic | Boolean | True \= appears in marketplace feed |
| pickupAvailable | Boolean |  |
| deliveryAvailable | Boolean |  |
| deliveryFeeKobo | Int | 0 \= free delivery |
| totalOrdersCount | Int | Running total of confirmed paid orders |
| createdAt / updatedAt | DateTime |  |

---

### DailyOrderItem

The menu items included in a daily order. Values are **snapshotted at publish time** — editing the menu later never corrupts this order.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid |  |
| dailyOrderId | String (FK) |  |
| menuItemId | String (FK) | Reference only — for "order again" feature |
| snapshotName | String | Locked at publish — immune to menu edits |
| snapshotPriceKobo | Int | Locked at publish |
| snapshotImageUrl | String? | Locked at publish |
| snapshotPrepMin | Int | Locked at publish |
| maxQuantity | Int? | Null \= unlimited |
| orderedQuantity | Int | Incremented atomically on each confirmed payment |

Optional extras a vendor makes available for a specific item on a daily order.  
Only applicable to items under the \*\*MEALS\*\* category. Snacks, drinks, and  
baked goods do not support extras.

| Field | Type | Notes |  
|---|---|---|  
| id | cuid | |  
| dailyOrderItemId | String (FK) | Links to the DailyOrderItem |  
| name | String | e.g. "Extra fish", "Plantain", "Salad" |  
| priceKobo | Int | Price of this addon in kobo |  
| displayOrder | Int | Ordering in the UI |

\---

\#\#\# BuyerOrderItemAddon  
Records which addons a buyer selected for a specific order item.  
Prices are snapshotted at order time — never referenced live.

| Field | Type | Notes |  
|---|---|---|  
| id | cuid | |  
| buyerOrderItemId | String (FK) | |  
| dailyOrderItemAddonId | String | Reference — for "order again" feature |  
| snapshotName | String | Addon name locked at order time |  
| snapshotPriceKobo | Int | Addon price locked at order time |  
| quantity | Int | Always matches the parent BuyerOrderItem quantity |  
| subtotalKobo | Int | snapshotPrice × quantity |

---

### BuyerOrder

A buyer's placed order against a specific daily order.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid |  |
| orderNumber | String (unique) | Human-readable: PCH-2026-000123 |
| dailyOrderId | String (FK) |  |
| vendorId | String | Denormalised for fast vendor dashboard queries |
| buyerId | String (FK) |  |
| campusId | String (FK) |  |
| status | OrderStatus | Full FSM documented in section 8.10 |
| fulfillmentType | FulfillmentType | PICKUP or DELIVERY |
| deliveryHostelName | String? | Delivery only |
| deliveryRoomNumber | String? | Delivery only, optional |
| deliveryAdditionalInfo | String? | Delivery only, optional |
| deliveryFullAddress | String? | Constructed full address string |
| subtotalKobo | Int | Sum of all item subtotals |
| deliveryFeeKobo | Int | 0 if pickup or free delivery |
| totalKobo | Int | subtotal \+ deliveryFee |
| cancellationReason | String? | Required when vendor or system cancels |
| cancelledBy | String? | 'buyer' / 'vendor' / 'system' |
| receiptUrl | String? | S3 pre-signed URL generated on COMPLETED |
| createdAt / updatedAt | DateTime |  |

---

### BuyerOrderItem

The items in a buyer's order. Prices are **snapshotted at order time** — not linked to live daily order item values.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid |  |
| buyerOrderId | String (FK) |  |
| menuItemId | String | Reference for "order again" feature |
| snapshotName | String | What the buyer agreed to |
| snapshotPriceKobo | Int | What the buyer agreed to pay |
| quantity | Int |  |
| subtotalKobo | Int | snapshotPrice × quantity |

---

### Payment

One payment record per buyer order.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid |  |
| buyerOrderId | String (unique FK) |  |
| buyerId | String |  |
| vendorId | String |  |
| paystackRef | String (unique) | Paystack reference — used for idempotency |
| paystackAccessCode | String | For Paystack popup/redirect |
| amountKobo | Int | Total charged — verified against this on webhook |
| platformFeeKobo | Int | **CORRECTED:** not ₦100 flat. On `Payment` this holds the **vendor commission** (8% of food subtotal). ⚠️ **Field-name trap:** `BuyerOrder.platformFeeKobo` holds the **buyer's** service fee — same name, two collections, two different pockets. Prefer the unambiguous `prechopCommissionKobo` / `paymentProcessingFeeKobo` |
| prechopCommissionKobo | Int | Vendor commission (8% of food subtotal) — the unambiguous field |
| paymentProcessingFeeKobo | Int | Buyer service fee (3% of food subtotal, capped ₦200) |
| foodSubtotalKobo | Int | Food \+ options, before either fee — the base both fees derive from |
| vendorAmountKobo / vendorSettlementKobo | Int | foodSubtotalKobo − prechopCommissionKobo (\+ delivery). **CORRECTED:** *not* `amountKobo − platformFeeKobo` — `amountKobo` also contains the buyer's fee, which was never the vendor's money |
| status | PaymentStatus |  |
| channel | String? | card / bank\_transfer / ussd — from Paystack |
| paidAt | DateTime? |  |
| webhookVerified | Boolean | True only after HMAC signature verified |
| idempotencyKey | String (unique) | Prevents duplicate webhook processing |
| createdAt / updatedAt | DateTime |  |

---

### Refund

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid |  |
| paymentId | String (unique FK) |  |
| amountKobo | Int |  |
| reason | String |  |
| paystackRefundId | String? | From Paystack refund API response |
| processedAt | DateTime? |  |
| createdAt | DateTime |  |

---

### Review

One review per completed order. Cannot be edited after submission.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid |  |
| buyerOrderId | String (unique FK) | Enforces one review per order |
| vendorId | String (FK) |  |
| buyerId | String (FK) |  |
| rating | Int | 1–5 |
| comment | String? | Max 200 characters |
| tags | String\[\] | Multi-select: "Fresh food" / "Fast prep" / "Good portion" / "Late delivery" / "Wrong order" |
| isFlagged | Boolean | Super admin or vendor flag for moderation |
| createdAt | DateTime |  |

---

### Notification

Every notification sent to any user is persisted here.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid |  |
| userId | String (FK) |  |
| title | String |  |
| body | String |  |
| type | String | ORDER\_PLACED / ORDER\_READY / ORDER\_CANCELLED / etc. |
| data | JSON? | Extra context — orderId, vendorId, etc. |
| isRead | Boolean |  |
| createdAt | DateTime |  |

---

### AuditLog

Append-only **by application convention**. Every state-changing operation writes here.

> **⚠️ CORRECTED (2026-07-15) — the database no longer guarantees this.** The original text read:
> *"No UPDATE or DELETE permissions granted to the application database user — enforced at the
> Supabase RLS level."* **Postgres and RLS are gone** (see §5); the store is MongoDB. Audit-log
> immutability is now an **application-layer convention, not a database guarantee** — no code path
> updates or deletes an audit row, but **nothing at the datastore level prevents it**, and anyone
> with the app's DB credentials can rewrite history. Do not cite this table as tamper-proof evidence,
> and do not claim RLS enforcement anywhere. Closing this gap needs a real control (a restricted Mongo
> role without `update`/`delete` on the collection, or an append-only external sink) — it is **not**
> in place today.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid |  |
| userId | String (FK) | Who performed the action |
| role | String | Their role at the time |
| action | String | ORDER\_STATUS\_CHANGED / PAYMENT\_VERIFIED / VENDOR\_SUSPENDED / etc. |
| resourceType | String | buyer\_order / vendor\_profile / payment / etc. |
| resourceId | String |  |
| previousState | JSON? | State before the change |
| newState | JSON? | State after the change |
| ipAddress | String |  |
| userAgent | String |  |
| createdAt | DateTime | No updatedAt — logs are never modified |

---

### AnalyticsSnapshot

Daily aggregates per vendor. All analytics are read from these snapshots — never from live order queries.

| Field | Type | Notes |
| :---- | :---- | :---- |
| id | cuid |  |
| vendorId | String (FK) |  |
| date | DateTime | Midnight of the aggregated day |
| totalOrders | Int |  |
| completedOrders | Int |  |
| cancelledOrders | Int |  |
| totalRevenueKobo | Int |  |
| avgOrderValueKobo | Int |  |
| topItemIds | String\[\] | Top 5 menu item IDs by order count |
| peakHour | Int? | 0–23 |
| newReviewCount | Int |  |
| avgRatingForDay | Float? |  |
| createdAt | DateTime |  |

Unique constraint on `(vendorId, date)`.

---

## 7\. User Roles & Permissions

| Action | Buyer | Vendor | Super Admin |
| :---- | :---- | :---- | :---- |
| Register / login via phone OTP | ✅ | ✅ | ✅ |
| Browse marketplace | ✅ | ✅ | ✅ |
| View vendor public profile | ✅ | ✅ | ✅ |
| Place an order | ✅ | ❌ | ❌ |
| Create / edit own menu items | ❌ | ✅ | ✅ |
| Create / publish daily orders | ❌ | ✅ (own only) | ✅ |
| Update own order status | ❌ | ✅ (own orders) | ✅ |
| Cancel own buyer order | ✅ (PAID/CONFIRMED only) | ❌ | ✅ |
| View own order history | ✅ | ✅ | ✅ |
| View all orders on platform | ❌ | ❌ | ✅ |
| Suspend / reactivate vendor | ❌ | ❌ | ✅ |
| Manage campuses | ❌ | ❌ | ✅ |
| View platform-wide analytics | ❌ | ❌ | ✅ |
| Submit review | ✅ (own completed orders only) | ❌ | ✅ |
| Flag / remove any review | ❌ | ❌ | ✅ |
| Report a review | ❌ | ✅ (own profile reviews) | ✅ |

---

## 8\. Feature Specifications

---

### 8.1 Authentication & Registration

#### Buyer Registration

Intentionally minimal. Anyone can sign up and order — not restricted to students.

**Fields collected:**

- First name  
- Last name  
- Phone number — primary identity and contact for all notifications  
- Campus selection — dropdown of active campuses, determines which marketplace the buyer sees

**Flow:**

1\. Buyer fills registration form

2\. Server validates, creates User (role \= BUYER, isPhoneVerified \= false)

3\. 6-digit OTP sent to phone via Termii (10-minute expiry)

4\. Buyer enters OTP → isPhoneVerified \= true → account active

5\. Buyer redirected to campus marketplace feed

No email required for buyers. No matric number. No approval gate. No passwords.

---

#### Vendor Registration — 3-Step Signup

Only what is strictly necessary to create the account is collected during signup. Everything else is completed inside the dashboard onboarding checklist.

**Step 1 — Account Details**

- First name  
- Last name  
- Phone number

**Step 2 — Business Identity**

- Business name  
- Vendor type tag (Student Cook / Campus Stall / Restaurant / Bakery)  
- Campus association — which campus are you serving?

**Step 3 — Location**

**If ON-CAMPUS:**

- School name (dropdown — seeded list of Nigerian universities and polytechnics)  
- Hostel / Stall name (free text, e.g. "Amina Hostel" or "Canteen B, Stall 4")

**If OFF-CAMPUS:**

- State (dropdown — all 36 Nigerian states \+ FCT)  
- Area / Address (free text, e.g. "Samaru, along ABU road")

**After Step 3:**

- Account created, role \= VENDOR, status \= INCOMPLETE  
- OTP sent to phone for verification (same flow as buyer)  
- Vendor lands in their dashboard with the onboarding checklist visible

> **⚠️ CORRECTED (2026-07-15).** The original text read: *"No approval gate. Vendor goes live on the
> marketplace automatically when `profileCompleteness` reaches 100%."* **Reversed — there is a manual
> admin approval gate.** Completing the checklist unlocks the **"Submit for review"** action; it does
> not make the vendor live. An admin must approve (→ `ACTIVE`) or reject with a reason
> (→ `CHANGES_REQUESTED`). See the vendor approval gate in §6 for the full state flow and for why
> completeness cannot be the gate.

**Approval gate:** Vendor completes the onboarding checklist → submits for review
(status → `PENDING_REVIEW`, profile becomes read-only) → an admin approves (→ `ACTIVE`, vendor
appears on the marketplace) or rejects with a reason (→ `CHANGES_REQUESTED`, vendor edits and
resubmits). A submission-received email is sent on submit.

---

#### Login — All Users

Login is **phone number \+ OTP only**. No passwords exist in this system.

1\. POST /api/auth/otp/request { phone }

2\. Server finds or creates user by phone number

3\. Generates 6-digit OTP → hashed with bcrypt → stored in Redis (TTL: 10 min)

4\. OTP sent via Termii SMS

5\. Rate limit: max 3 OTP requests per phone per 10 minutes, then 30-minute lockout

6\. POST /api/auth/otp/verify { phone, otp }

7\. Server verifies OTP hash in Redis

8\. Deletes OTP from Redis (single-use)

9\. Issues access token: JWT RS256, 15-minute expiry

10\. Issues refresh token: cryptographically random 64-byte hex string

    → Hashed with bcrypt → stored in RefreshToken table

    → Raw token sent as httpOnly \+ Secure \+ SameSite=Strict cookie

11\. Returns { accessToken, user }

**Token Refresh:**

1\. POST /api/auth/refresh (refresh token read from httpOnly cookie)

2\. Hash incoming token → find RefreshToken record

3\. Check: not expired, usedAt is null, not revoked, device fingerprint matches

4\. Mark old token as used (usedAt \= now)

5\. Issue new access token \+ new refresh token (full rotation — single use enforced)

6\. Return { accessToken }

**Compromise Detection:** If a refresh token with a non-null `usedAt` is presented → all RefreshToken records for that user are immediately revoked → user must re-authenticate via OTP → security notification sent to their phone via SMS.

**Logout:**

1\. POST /api/auth/logout (authenticated)

2\. Mark current RefreshToken as revoked

3\. Clear httpOnly cookie

4\. Access token expires naturally within 15 minutes

---

#### Vendor Dashboard Onboarding Checklist

Displayed prominently until all items are complete.

> **⚠️ CORRECTED (2026-07-15).** The original text added: *"Vendor cannot appear in the marketplace
> until `profileCompleteness = 100`."* **The percentages in the table below are a progress indicator,
> not a gate.** What unlocks "Submit for review" is the **onboarding checklist** (phone, business
> name, categories, location, bank/subaccount, profile image) — see §6. Note that "3 menu items" and
> "timetable" below are *not* on the submission checklist and cannot be completed before approval:
> both are behind the active-vendor gate. Marketplace visibility requires **admin approval**, not a
> score.

| Task | Points |
| :---- | :---- |
| Phone verified | 10% |
| Upload profile photo | 15% |
| Select at least one menu category | 10% |
| Add at least 3 menu items with prices | 25% |
| Set weekly timetable (at least 1 day) | 15% |
| Add bank details (Paystack subaccount created) | 25% |

When 100% is reached → `VendorProfile.status` transitions from `INCOMPLETE` → `ACTIVE` → vendor appears on marketplace automatically.

Bank details submission is the silent verification gate — Paystack subaccount creation happens here. If it fails (invalid account details), vendor is notified via SMS and cannot receive payments until resolved.

---

### 8.2 Vendor Dashboard

**Home Overview**

- Profile completeness bar (hidden once 100%)  
- "Open for Orders" toggle — global availability signal shown on vendor's marketplace profile  
- Today's summary: total orders received, total revenue, pending confirmations  
- Upcoming timetable: next 3 days preview  
- Recent reviews: last 3 received  
- Quick action: "Create Today's Order" button

**Live Order Feed (Supabase Realtime)** The vendor dashboard subscribes to Supabase Realtime on the `BuyerOrder` table, filtered to their `vendorId` and status `PAID`. Every new paid order appears on the dashboard instantly without page refresh.

Each incoming order card shows:

- Order number (PCH-2026-XXXXXX)  
- Buyer first name  
- Items list with quantities  
- Fulfillment type badge (PICKUP / DELIVERY)  
- Delivery address (if delivery)  
- Total amount in Naira  
- Time received  
- Confirm button — one tap transitions order to CONFIRMED

**Order Pipeline View** Orders are displayed in columns: Paid → Confirmed → Preparing → Ready → Completed. Each active order card shows the appropriate next-step action button.

**Order Management**

- Full order list with filters: date range, status, fulfillment type  
- Search by order number  
- Cancel order with mandatory reason field — triggers automatic Paystack refund

**Earnings**

> **⚠️ CORRECTED (2026-07-15) — "Paystack settlement history" and "Pending payout balance" cannot be
> built and have been removed.** **PreChop never holds vendor money.** Paystack subaccount splits
> settle the vendor **directly** at charge time, so there is no float for a pending balance to be a
> balance *of* — the number would always be fiction. PreChop also does not integrate Paystack's
> settlements API, so it has no settlement date it is entitled to state. Do not reintroduce either
> field; a plausible-looking "pending ₦X" a vendor cannot reconcile is worse than no field.

- Today / This Week / This Month / All-time — **gross** (food \+ delivery the vendor carries),
  **PreChop fee** deducted at split time, and **net settled** by Paystack
- Per-day history on the **Africa/Lagos** calendar — a vendor checking at 00:30 Lagos sees today's
  money, not yesterday's
- Bucketed on when the money actually landed (`paidAt`), so an order placed 23:58 and paid 00:02
  belongs to the new day
- Derived from `Payment` rows with `status: SUCCESS` — the split persisted at placement is the only
  record of what Paystack was told to settle; never recomputed on read
- **No settlement date. No pending balance.** Net settled is what Paystack sent to the vendor's bank
- A vendor may only ever read their **own** earnings — the vendor is resolved from the authenticated
  user, never from a caller-supplied `vendorId`

##### **Boost Your Order**

A curated list of campus WhatsApp TV accounts vendors can contact directly to promote their daily order link. Displayed in the vendor dashboard below the shareable link card.

Each entry shows:

* TV account name (e.g. "ABU Info TV")  
* Audience size (e.g. "12k members")  
* Price range (e.g. "₦500 – ₦1,500 per post")  
* "Message on WhatsApp" button → opens `wa.me/{number}` in a new tab

List is campus-scoped — vendors only see TVs relevant to their campus.

**Phase 1:** Static curated list maintained manually by super admin.  
 **Phase 2:** TVs create PreChop accounts, vendors pay boost fees on-platform via Paystack, PreChop takes 10–15% commission.

---

### 8.3 Menu Builder

**Location in dashboard:** My Menu tab

**Category Selection** Vendor selects which categories apply to them (Meals / Snacks / Drinks / Baked Goods). Can be updated any time from profile settings.

**Adding a Menu Item**

| Field | Required | Notes |
| :---- | :---- | :---- |
| Item name | ✅ | e.g. "Fried Rice \+ Beef" |
| Category | ✅ | From vendor's selected categories |
| Price (₦) | ✅ | Stored as kobo internally |
| Estimated prep time | ✅ | In minutes — shown to buyers at checkout |
| Photo | ❌ | S3 upload via pre-signed URL, max 5MB, JPEG/PNG/WEBP |
| Description | ❌ | Max 120 characters |

**Managing Items**

- Edit any field at any time — changes do not affect published daily orders because prices are snapshotted at publish time  
- Toggle availability (Available ↔ Unavailable) without deleting  
- Mark as Sold Out mid-day — auto-resets at midnight via BullMQ daily job  
- Delete item — soft delete (`deletedAt` timestamp set); item is preserved on all historical order records  
- Drag-and-drop reorder — `displayOrder` field updated

##### **Extras / Add-ons per Item**

After creating a menu item, the vendor can attach an **extras list** to it — optional additions a buyer can select when ordering that item.

Each extra has:

* Name (e.g. "Extra Beef", "Extra Fish", "Extra Chicken", "Extra Sauce")  
* Price (₦) — added on top of the base item price  
* Availability toggle

Example:

Menu item:  Fried Rice \+ Chicken — ₦1,500

  Extras:

    Extra Beef     — ₦300

    Extra Fish     — ₦250

    Extra Chicken  — ₦300

    Extra Sauce    — ₦100

Extras are optional for the buyer — they appear below the item on the order page. A buyer can select one or more extras per item, each with its own quantity. All selected extras are summed and added to that item's subtotal.

Extras are snapshotted at order time (same as item prices) — vendor editing or deleting an extra after an order is placed never affects that order's total.

---

### 8.4 Timetable / Schedule System

**Location in dashboard:** My Schedule tab

**Weekly Grid** Seven-day grid (Mon–Sun). For each day the vendor sets:

- Toggle: Open / Closed  
- If Open: multi-select chips from their active menu items

Example:

Monday    \[OPEN\]    → Fried Rice \+ Beef  |  Fried Rice \+ Fish  |  Zobo

Tuesday   \[OPEN\]    → Jollof Rice \+ Chicken  |  Chapman

Wednesday \[CLOSED\]

Thursday  \[OPEN\]    → Semo \+ Egusi  |  Pounded Yam \+ Oha  |  Zobo

Friday    \[OPEN\]    → Shawarma  |  Chin-Chin  |  Soft Drinks

Saturday  \[CLOSED\]

Sunday    \[CLOSED\]

**Buyer-Facing Timetable Preview** On the vendor's public profile, buyers see the full weekly timetable in read-only format:

- Open days show the items scheduled for that day  
- Closed days show "Not cooking"  
- Future days show items as a preview labelled: *"Opens at \[vendor's usual cutoff time\]"*  
- This builds buyer anticipation and drives return visits without any extra effort from the vendor

**Order Template Feature** When vendor taps "Create Today's Order," the system detects the current day of week and prompts:

*"Use your Thursday timetable? — Semo \+ Egusi, Pounded Yam \+ Oha, Zobo"*

One tap → daily order form pre-populated with timetable items, their current prices, and the vendor's most recently used cutoff time. Vendor reviews, adjusts if needed, and publishes.

---

### 8.5 Order Creation by Vendor

**Step 1 — Order Details**

- Title: auto-suggested from timetable (editable), e.g. *"Thursday Special — Semo & Egusi"*  
- Scheduled date: date picker — today or a future date  
- Cutoff time: the hard deadline for buyer orders  
- Option to load from timetable template — auto-populates Step 2

**Step 2 — Select Items & Configure Extras** 

- Checklist of vendor's available menu items, grouped by category   
- For each selected item: vendor is aware extras will be visible to buyers on this order   
- Optional \*\*max quantity\*\* field (stock limit — leave blank for unlimited)   
- Price shown from current menu (read-only here — edit prices in Menu Builder)   
- \*\*Extras section\*\* (MEALS category only — does not appear for Snacks, Drinks, or Baked Goods):   
- An optional expandable section labelled \*"Add extras buyers can choose from"\* \- Vendor   
- adds extra items one by one. Each extra has:   
- Name (e.g. "Extra fish", "Plantain", "Salad", "Extra beef") \- Price in ₦ \- A \*\*"+ Add extra"\*\* button adds more rows. Each row has a remove button. \- No limit on how many extras per item. \- If left empty, the item has no extras — buyer just pays the base price. \- Extras are saved as part of this daily order only. They do not carry over to the next daily order — vendor sets them fresh each time. Example of a configured item: Jollof Rice \+ Chicken — ₦2,500 — Max 30 Extras: Extra fish ₦600 \[×\] Plantain ₦200 \[×\] Salad ₦600 \[×\] Extra beef ₦400 \[×\] \[ \+ Add extra \] 

**Step 3 — Fulfillment Options** Vendor selects at least one option:

- ☐ Pickup Available — buyer collects at vendor's location  
- ☐ Delivery Available — vendor delivers to buyer  
  - If checked: Delivery Fee (₦) field appears (enter amount, or 0 for free delivery)  
  - Delivery fee is added to buyer's order total at checkout and collected via Paystack

**Step 4 — Review & Publish**

- Full summary: title, date, cutoff, items, fulfillment options, delivery fee  
- **Save as Draft** — stored, not visible to buyers, freely editable  
- **Publish** — order goes ACTIVE, shareable link generated, appears on marketplace

**Shareable Link** On publish, a public link is constructed from the `shareableToken`:

https://prechop.ng/o/{shareableToken}

Link is displayed with a copy button and WhatsApp share button. No account required to **view** the order page. Account required to **place** an order. Link redirects to an "Order closed" page after `cutoffTime` passes.

---

### 8.6 Marketplace / Discovery

#### Campus Feed — Buyer Home Screen

Default view after login. Shows all ACTIVE public daily orders for the buyer's selected campus, sorted by **cutoff soonest first** — this creates natural urgency without any artificial mechanic.

Each order card shows:

- Vendor profile thumbnail and name  
- Vendor type tag and rating  
- Order title  
- First 3 item names with prices  
- Fulfillment badges: PICKUP / DELIVERY / BOTH  
- Live cutoff countdown timer (e.g. *"Closes in 1h 45m"*)  
- Price range of items on this order

Buyers only see vendors scoped to their selected campus. An off-campus buyer sees vendors near their selected campus — not the entire platform.

#### Vendor Directory

Full list of all ACTIVE vendors for the buyer's campus.

Filters:

- Category: Meals / Snacks / Drinks / Baked Goods  
- Fulfillment: Pickup only / Delivery available  
- Status: Open Now / All  
- Sort: Rating (high to low) / Newest

#### Vendor Status Badges

| Badge | Condition |
| :---- | :---- |
| 🟢 Open — Taking Orders | Has ACTIVE daily order within cutoff window AND `isOpenForOrders = true` |
| 🟡 Closing Soon | Active order with cutoff within 30 minutes |
| 🔴 Closed Today | No active order today or all orders past cutoff |
| 🕐 Opens at \[time\] | Scheduled future order for today not yet active |
| 🆕 New Vendor | Fewer than 5 completed **reviews** — no rating displayed |

> **⚠️ CORRECTED (2026-07-15) — this row said "fewer than 5 completed *orders*", contradicting
> §8.12 ("5 completed reviews").** **Ruled: reviews.** Gating on orders would let a vendor with 50
> orders and a single 5-star review publish an unqualified "5.0" — exactly the manipulation the rule
> exists to stop, and orders are not a measure of how much *rating* evidence exists. The two sections
> now agree. Implemented as `MIN_REVIEWS_FOR_PUBLIC_RATING = 5` in
> `src/server/services/vendors/publicVendor.ts`; the rating is nulled **server-side** below the
> threshold, so a sub-threshold score never crosses the wire (a client-side gate would still ship the
> number in the response body). Ungated vendors also sort *below* every rated vendor, never above.

#### Vendor Public Profile Page

- Profile photo, business name, type tag, location label  
- Status badge (live)  
- Rating — hidden if fewer than 5 completed reviews; "New Vendor" shown instead  
- Category badges  
- Today's Orders section — active daily orders, each with an "Order Now" button  
- Weekly Timetable Preview — read-only schedule  
- Reviews — last 5 reviews: star rating, optional comment, tags, buyer first name, date  
- About — vendor description

---

### 8.7 Buyer Order Flow

#### 1\. Entry Point

Buyer arrives via:

- **Direct link** from vendor's WhatsApp share (`/o/{shareableToken}`)  
- **Marketplace** by tapping "Order Now" on a vendor card or order card

Both routes lead to the same Order Page.

#### 2\. Order Page

- Vendor name, rating, location, cutoff countdown  
- Items list: name, photo (if set), price, prep time estimate  
- Quantity selector (+/−) per item — min 0, max \= item's remaining stock if a limit was set  
- Cart total updates live as buyer adjusts quantities  
- If a menu item has extras, an **"Add extras"** expand section appears below it once the buyer adds the item to their cart. Each extra shows its name and price with its own \+/− quantity selector. Selected extras are listed under the item in the cart summary with their individual prices.

\*\*Extras selection (MEALS items only):\*\*

If the vendor configured extras for an item, an extras section appears

below that item labelled \*"Make it yours — add extras"\*. Each extra is

displayed as a checkbox card showing the name and price. Rules:

\- Extras are \*\*per plate\*\* — if the buyer orders 2 plates of jollof rice

  and checks "Extra fish", they get fish with both plates and the price

  doubles accordingly.

\- No limit on how many extras a buyer can select.

\- Selecting or deselecting an extra updates the price breakdown instantly

  with no page reload.

\- The price breakdown shows:

Jollof Rice \+ Chicken (×2) ₦5,000

* Extra fish (×2) ₦1,200  
* Plantain (×2) ₦400  
   ─────────────────────────────────────  
   Subtotal ₦6,600  
   Service fee ₦198        (CORRECTED: 3% of ₦6,600, capped at ₦200 — not a ₦50 flat fee)  
   ─────────────────────────────────────  
   Total ₦6,798

\- Extras are sent to the server as a list of addon IDs only — the server

  fetches all prices itself and calculates the total. The frontend never

  sends a price.

#### 3\. Cart & Checkout

Buyer taps "Proceed to Checkout":

- Order summary: items, quantities, subtotal  
- Fulfillment selection (shown only if vendor offers both options):  
  - ○ Pickup — collect at \[vendor location\]  
  - ○ Delivery — ₦\[deliveryFee\] — deliver to me  
- If Delivery selected, address fields expand:  
  - Hostel name (text input)  
  - Room number (optional)  
  - Additional directions (optional)  
- Order total \= subtotal \+ extras subtotals per item  \+ delivery fee (0 if pickup or free delivery)  
- "Place Order & Pay" button

#### 4\. Payment

- Server creates `BuyerOrder` (status: PENDING\_PAYMENT), initialises Paystack transaction  
- Buyer is redirected to Paystack's hosted payment page  
- Paystack supports: debit card, bank transfer, USSD — buyer picks at Paystack's checkout

#### 5\. Post-Payment

- Paystack fires webhook → server verifies signature → order transitions to PAID  
- Buyer lands on Order Confirmation screen:  
  - Order number (PCH-2026-XXXXXX)  
  - Vendor name and items ordered  
  - Fulfillment type and address  
  - Estimated ready time based on longest prep time among ordered items  
  - "Track Order" button  
- SMS sent to buyer confirming order

#### 6\. Order Tracking

From "My Orders," buyer can track live status at any time:

- Status timeline: Paid → Confirmed → Preparing → Ready → Completed  
- Estimated ready time  
- Vendor contact for pickup questions  
- Cancel button — available in PAID and CONFIRMED states only

#### "Order Again" Shortcut

Every COMPLETED order in the buyer's history shows an "Order Again" button. Pre-fills the cart with the same items from the same vendor. Buyer still goes through full checkout. Available only if the vendor's menu still contains those items.

---

### 8.8 Fulfillment — Pickup & Delivery

#### Pickup

- Vendor's location label is shown at checkout and on the confirmation screen  
- Vendor marks order READY → buyer notified via SMS: *"Your order is ready — come collect\!"*  
- Buyer presents order number at collection point  
- Vendor taps COMPLETED to close the order

#### Delivery

- Vendor handles own delivery logistics — PreChop is not a logistics intermediary  
- Delivery address provided by buyer is shown in the vendor's dashboard on the order card  
- Delivery fee is collected via Paystack as part of the order total — no separate cash handling  
- Vendor marks READY when food is packed and they are heading out  
- Vendor marks COMPLETED when delivered

#### Delivery Fee Rules

- Set by vendor at order creation time — applies uniformly to all buyers selecting delivery on that order  
- Delivery fee of 0 shows a "Free Delivery" badge on the order card and marketplace listing  
- Delivery fee is **non-refundable** once order reaches PREPARING state  
- If order is cancelled before PREPARING: full amount including delivery fee is refunded

---

### 8.9 Payment Flow

**Platform Fee Structure**

> **⚠️ CORRECTED (2026-07-15) — the flat ₦50 / ₦100 model was never implemented and is not the
> product.** The original text read: *"Buyer pays ₦50 … Vendor pays ₦100 … PreChop collects ₦150
> total per order."* **The percentage model below is the real one** and is what the code charges.
> Every "₦50", "₦100" or "₦150" elsewhere in this PRD is stale — treat this section as authoritative.

PreChop charges **two** fees per order, both derived from the **food subtotal** (`subtotalKobo`,
which includes selected option prices — not delivery, not the buyer's own fee):

| Fee | Rate | Paid by | Field |
| :---- | :---- | :---- | :---- |
| Buyer service fee | **3% of food subtotal, capped at ₦200** (20,000 kobo) | Buyer — **added** to the checkout total as a line item | `paymentProcessingFeeKobo` |
| Vendor commission | **8% of food subtotal**, uncapped | Vendor — **deducted** from their settlement | `prechopCommissionKobo` |

* Buyer's total = food subtotal \+ buyer service fee (`totalKobo`).
* Vendor's settlement = food subtotal − vendor commission (`vendorSettlementKobo`), handed to
  Paystack as the subaccount split amount at transaction init.
* PreChop's take per order = buyer service fee \+ vendor commission (**≈11% of the food subtotal**,
  with the buyer half capped at ₦200 — *not* a flat ₦150).
* Both are computed **server-side at order placement** and persisted; nothing is recomputed later,
  so what a vendor is shown is what Paystack was actually told to settle.

**Worked example** — ₦2,000 of food:

```
Food subtotal          ₦2,000.00
Buyer service fee (3%)    ₦60.00   → buyer pays ₦2,060.00
Vendor commission (8%)   ₦160.00   → vendor settles ₦1,840.00
PreChop receives         ₦220.00
```

At ₦10,000 of food the buyer fee would be ₦300 at 3% but **caps at ₦200**; the vendor's 8% (₦800)
does not cap.

**Where the rates live (as built).** The rates are **admin-governed via `siteConfigs`** (Admin →
Settings), with **environment variables as the fallback**. `placeOrder` resolves the live policy with
`resolveFeePolicy(config)` (`src/constants/fees.ts`), reading from the config document — never from
the request.

| `siteConfigs` field | Env fallback | Default | Meaning |
| :---- | :---- | :---- | :---- |
| `platformFeeBuyerPercent` | `PLATFORM_FEE_BUYER_PERCENT` | `3` | Buyer service fee rate |
| `platformFeeBuyerMaxKobo` | `PLATFORM_FEE_BUYER_MAX_KOBO` | `20000` | Buyer fee cap (₦200) |
| `platformFeeVendorPercent` | `PLATFORM_FEE_VENDOR_PERCENT` | `8` | Vendor commission rate |

**Precedence:** valid `siteConfigs` value ► env constant ► hard-coded default. An admin change takes
effect **without a redeploy**.

**A config problem can never silently charge 0.** This is the load-bearing guard on the money path,
because the failure here is not a crash — it is a *silent wrong charge*. An **absent** field falls
back quietly (it simply isn't configured). A **present-but-invalid** field (`""` → `Number("")` is
`0`; `"8%"` → `NaN`; `null`; negative; over 100%; a hand-edited Mongo doc; a legacy doc from a
partial migration) falls back to the standing rate **loudly**, with a `console.warn` naming the
field. An **explicit, valid `0` is honoured** — a promo is not a typo. Percentages are applied at
basis-point resolution then rounded to whole kobo (Nigeria has no sub-kobo denomination).

> **⚠️ Retired (do not reintroduce): `platformFeeBuyerKobo` / `platformFeeVendorKobo`.** The old
> flat-kobo fields defaulted to **0**, were editable in Admin → Settings, and were **read by nothing**
> in the pricing path — an admin "changing the fee" silently did nothing. They are gone from the
> schema, the defaults and the validator. A legacy document still carrying only those fields resolves
> to the standing percentage rates, not to 0.

Both fees are applied automatically via the Paystack split — no manual processing.

Buyer places order → POST /api/orders

        │

        ▼

Server (in a single DB transaction):

  → Acquires SELECT FOR UPDATE lock on DailyOrder row

  → Checks: status \= ACTIVE, cutoffTime not passed

  → Checks: orderedQuantity \+ requested quantity ≤ maxQuantity (per item)

  → Fetches all prices server-side: base item prices from DailyOrderItem  
  snapshots, addon prices from DailyOrderItemAddon records.  
  The client sends: dailyOrderId, items (menuItemId \+ quantity \+  
  selected addonIds). Nothing else. The server calculates everything.

  → Creates BuyerOrder { status: PENDING\_PAYMENT }

  → Creates BuyerOrderItems with snapshotted prices

  → Calculates: subtotalKobo, deliveryFeeKobo, totalKobo

  → Generates idempotencyKey \= hash(buyerOrderId \+ timestamp)

  → Initialises Paystack transaction with split:

       8% vendor commission → PreChop main account
       (CORRECTED: not a ₦100 flat fee — see the fee table above)

       remainder (vendorSettlementKobo) → vendor's paystackSubaccountCode

  → Creates Payment record { status: INITIALIZED }

  → Sets Redis soft lock on item slots (10-min TTL)

  → Returns { paymentUrl, paystackAccessCode } to client

        │

        ▼

Buyer completes payment on Paystack

        │

        ▼

Paystack fires POST /api/webhooks/paystack

        │

        ├── Verify HMAC-SHA512 signature → reject with 401 if invalid

        ├── Check idempotencyKey → if already processed, return 200 silently

        ├── Verify amountKobo matches Payment.amountKobo in DB → reject if tampered

        │

        ▼

All checks pass:

  → Payment.status \= SUCCESS, Payment.webhookVerified \= true

  → BuyerOrder.status \= PAID

  → Release Redis item soft locks

  → Increment DailyOrderItem.orderedQuantity for each item (atomic)

  → Increment DailyOrder.totalOrdersCount (atomic)

  → Notify vendor: Supabase Realtime \+ SMS (Termii)

  → Notify buyer: SMS confirmation

  → Enqueue BullMQ: cutoff.enforce job (fires at DailyOrder.cutoffTime)

  → Enqueue BullMQ: cutoff.warning job (fires 30 min before cutoff)

  → Append to AuditLog

        │

        ▼

Vendor confirms → CONFIRMED

Vendor starts cooking → PREPARING

Vendor marks done → READY → buyer notified via SMS

Vendor marks delivered/collected → COMPLETED

        │

        ▼

On COMPLETED:

  → BullMQ: receipt.generate job

       → Build PDF receipt

       → Upload to S3: receipts/{campusId}/{vendorId}/{buyerOrderId}.pdf

       → Store pre-signed URL on BuyerOrder.receiptUrl (1-year expiry)

       → Send receipt link to buyer via email (Resend) \+ SMS (Termii)

  → VendorProfile.totalOrders \+= 1

  → Enqueue review prompt notification to buyer (24-hour delay)

  → Append to AuditLog

#### Refund Policy

| Status at Cancellation | Refund | Amount |
| :---- | :---- | :---- |
| PENDING\_PAYMENT | N/A | Never paid |
| PAID | ✅ Full refund | Subtotal \+ delivery fee |
| CONFIRMED | ✅ Full refund | Subtotal \+ delivery fee |
| PREPARING | ❌ No refund | Food is being cooked |
| READY | ❌ No refund | Food is ready |
| COMPLETED | ❌ No refund | Transaction closed |

Refunds processed via Paystack Refund API. Standard processing: 5–10 business days. Buyer notified via SMS immediately when refund is initiated.

---

### 8.10 Order State Machine

                  PENDING\_PAYMENT

                        │

                        │  Paystack webhook verified

                        ▼

                       PAID ◄─────────────────────────────┐

                        │                                  │

                        │  Cutoff passes, vendor has       │ BullMQ cutoff.enforce job fires

                        │  not confirmed ──────────────────┘ → CANCELLED \+ auto-refund

                        │

                        │  Buyer cancels (allowed here) → CANCELLED \+ auto-refund

                        │

                        │  Vendor confirms

                        ▼

                    CONFIRMED

                        │

                        │  Buyer cancels (allowed here) → CANCELLED \+ auto-refund

                        │  Vendor cancels (requires reason) → CANCELLED \+ auto-refund

                        │

                        │  Vendor starts cooking

                        ▼

                    PREPARING

                        │

                        │  No cancellation or refund from this point onwards

                        │

                        │  Food is ready

                        ▼

                      READY

                        │

                        │  Buyer collects / vendor delivers

                        ▼

                    COMPLETED ──► Receipt generated, review prompt sent (24hr delay)

─────────────────────────────────────────────────────

CANCELLED can be triggered by:

  \- Buyer (in PAID or CONFIRMED states only)

  \- Vendor (in PAID or CONFIRMED states only — reason required)

  \- System via BullMQ (at cutoffTime if order is still PAID and unconfirmed)

All CANCELLED states from PAID or CONFIRMED trigger automatic Paystack refund.

─────────────────────────────────────────────────────

#### Cutoff Enforcement Detail

> **⚠️ CORRECTED (2026-07-15) — mechanism changed (BullMQ delayed job → cron sweep); the outcome is
> as specified.** There is no per-order delayed job. `cutoff.enforce` is a **cron sweep every 5
> minutes** (`src/server/services/buyerOrders/sweepStalePaidOrders.ts`), so enforcement happens on
> the **next tick after cutoff — up to ~5 minutes late**, not exactly at `cutoffTime`.

This sweep is why a buyer who paid and was never confirmed no longer ends up with **no food and no
refund, forever**. The listing-closing sweep only closes the *listing*; the paid buyer orders
underneath it would otherwise sit in PAID indefinitely with the money already taken.

1. Cron sweep runs every 5 minutes (single-instance Redis lock `cron:lock:{db}:cutoff-enforce`,
   280s TTL so a slow batch can't overlap the next tick)  
2. Finds orders still `PAID` whose listing cutoff has passed (batch limit 200)  
3. **Conditional write is the race guard:** `PAID → CANCELLED` with `fromStatuses: [PAID]`,
   `cancelledBy = 'system'`. A vendor confirming at the same moment wins and the sweep no-ops on that
   order — so an order the vendor is already cooking is never refunded  
4. Only the caller that actually flipped the row issues the **full-amount Paystack refund**
   (`totalKobo`), persisted as a `Refund` record  
5. Notifies the buyer (`ORDER_REFUNDED`)  
6. Capacity is deliberately **not** returned to the listing — its cutoff has passed, so the slots are
   worthless and re-incrementing them would corrupt the day's numbers  
7. Orders already CONFIRMED or beyond are untouched  
8. Each order is independent: one failure is logged and the sweep continues, so a single
   un-refundable order cannot starve every other buyer in the batch

---

### 8.11 Notifications

All notification dispatch is handled by BullMQ workers — never inline in the request/response cycle. The API enqueues the job and immediately returns a response. The worker processes it asynchronously.

#### Notification Events

| Event | Buyer | Vendor |
| :---- | :---- | :---- |
| Order placed (payment confirmed) | ✅ SMS \+ Email | ✅ SMS \+ Supabase Realtime |
| Vendor confirms order | ✅ SMS | — |
| Order being prepared | ✅ In-app | — |
| Order ready for pickup / out for delivery | ✅ SMS | — |
| Order completed | ✅ Receipt via Email \+ SMS | ✅ In-app (settlement note) |
| Order cancelled (any party) | ✅ SMS \+ Email (refund info) | ✅ SMS |
| Cutoff warning (30 min before) | ✅ In-app | ✅ SMS ("30 min to cutoff — X orders so far") |
| Auto-cancel at cutoff | ✅ SMS \+ Email | ✅ SMS |
| Review prompt (24hr after completion) | ✅ In-app | — |
| New review received | — | ✅ In-app |
| Profile suspended by admin | — | ✅ SMS \+ Email |

#### Notification Channels

| Channel | Provider | Used For |
| :---- | :---- | :---- |
| In-app bell | DB Notification table | All events — persisted, shown in notification panel |
| SMS | Termii | Critical events: OTP, order confirmed, order ready, cancellations |
| Email | Resend | Receipts, registration confirmation, cancellation refund confirmations |
| Realtime | Supabase Realtime | Vendor dashboard live order feed only |

---

### 8.12 Ratings & Reviews

#### Trigger

24 hours after `BuyerOrder.status` reaches COMPLETED, the buyer receives an in-app notification: *"How was your order from \[Vendor\]? Leave a quick review."* Review window: 48 hours from notification. After that, the option expires permanently.

#### Review Submission

| Field | Required | Constraints |
| :---- | :---- | :---- |
| Star rating | ✅ | 1–5 integer |
| Comment | ❌ | Max 200 characters |
| Tags | ❌ | Multi-select: "Fresh food" / "Fast prep" / "Good portion" / "Late delivery" / "Wrong order" |

One review per completed order. Cannot be edited after submission.

#### Display Rules

- Vendor's average rating shown on marketplace cards, vendor directory, and profile page  
- Minimum 5 completed reviews before rating score is displayed publicly  
- Below 5 reviews: "New Vendor" badge shown instead of stars  
- Last 5 reviews shown on vendor profile: star rating, comment, tags, buyer first name, date  
- `VendorProfile.rating` and `VendorProfile.totalReviews` updated immediately after each new review

#### Moderation

- Super Admin can flag or permanently remove any review  
- Vendors can report a review from their dashboard  
- Reported reviews are queued in the Super Admin panel for resolution

---

### 8.13 Digital Receipts

Generated automatically when an order reaches COMPLETED (fire-and-forget background render, not a
BullMQ job — see §5). Only COMPLETED orders have a receipt.

> **⚠️ CORRECTED (2026-07-15) — the "pre-signed URL (1-year expiry)" design was rejected on security
> grounds and is not what ships.** A pre-signed URL is a **bearer credential**: anyone holding it can
> read the receipt with no authentication. A 1-year URL stored on the order would spray that
> credential through every cache, log and client store that ever serialised an order, and would
> expire silently a year later with no way to tell. **Do not reintroduce `receiptUrl` as an S3 link.**
> (Note `BuyerOrder.receiptUrl` already means something else — it holds the public `/receipt/{token}`
> link used by the "Pay for Me" flow — so writing an S3 key into it would break that flow.)

**Receipt contents:**

- PreChop logo and tagline  
- Order number  
- Date and time of order  
- Buyer name  
- Vendor name and location  
- Itemised table: item name | quantity | unit price | subtotal  
- Delivery fee (if applicable)  
- Total paid  
- Fulfillment type  
- Payment channel (card / bank transfer / USSD — from Paystack)  
- Paystack transaction reference

**Flow:**

1\. BuyerOrder.status transitions to COMPLETED

2\. Receipt generation is kicked off in the background — it **never throws**: a receipt failure must
   not roll back or fail the vendor's status update, and the fetch path (step 6) regenerates on demand

3\. PDF generated server-side

4\. PDF uploaded to the private S3 bucket at a **deterministic key derived from the order id**:

   path: receipts/order-{buyerOrderId}.pdf

   Deterministic, so generation is naturally **idempotent** — a re-run overwrites the same object
   instead of orphaning a second PDF. The key is never stored.

5\. Buyer notified by email via Resend, with the **receipt PDF attached** (the PDF is already durably
   stored, so a bounced email cannot fail the receipt)

6\. **`GET /api/orders/{orderId}/receipt`** → **`302` redirect** to a **freshly-signed S3 URL with a
   5-minute TTL** (`cache-control: private, no-store`, so no CDN or shared proxy can cache the
   credential and hand it to someone else). **Not** a URL in a JSON body.

   - Authorisation reuses `getOrderById`, which admits only the **owning buyer or owning vendor** —
     the receipt inherits the order's own access rules instead of inventing weaker ones
   - **Self-healing:** if the object is missing (generation failed, or the order completed before
     receipts shipped) it is rendered synchronously on this path

---

### 8.14 Super Admin Panel

Full platform control for the platform owner.

**Dashboard**

- Platform-wide daily GMV (gross merchandise value)  
- Total active vendors across all campuses  
- Total orders today  
- System health: API error rate, BullMQ queue depths

**Campus Management**

- Create new campus (name, short code, state)  
- Activate / deactivate campus  
- View all vendors and orders per campus

**Vendor Management**

- View all vendors across all campuses with filters: status, campus, vendor type  
- View individual vendor profile, order history, and analytics  
- Suspend vendor (with reason) — vendor removed from marketplace immediately  
- Reactivate vendor  
- Override bank details for payout resolution

##### **WhatsApp TV Management**

* Add / edit / remove WhatsApp TV entries per campus  
* Fields: name, WhatsApp number, audience size, price range, campus, active toggle

**Order Oversight**

- View any order across the platform  
- Manually trigger refund on any PAID or CONFIRMED order  
- View and resolve flagged disputes

**Review Moderation**

- View all flagged reviews  
- Remove reviews that violate platform guidelines  
- Respond to vendor review reports

**Analytics**

- Cross-campus GMV trend  
- Top vendors by revenue and by rating  
- New vendor growth week over week  
- Order volume by campus  
- Most popular food categories platform-wide  
- Buyer retention: percentage of buyers with 2 or more orders

---

### 8.15 Analytics

#### Vendor Analytics

All analytics read from `AnalyticsSnapshot` records — never from live order queries. Zero impact on live performance.

Metrics:

- Today's revenue and order count  
- Weekly revenue trend — last 7 days  
- Monthly revenue summary  
- Top 5 items by order count (current month)  
- Peak ordering hours — order volume by hour  
- Cancellation rate (%) — current month  
- Completion rate (%) — current month  
- Average order value  
- Rating trend over last 30 days  
- Total lifetime orders and revenue

#### Data Pipeline

Daily at 00:01:

  BullMQ analytics.aggregate job fires for each ACTIVE vendor

  → Queries BuyerOrder for that vendor on that date

  → Computes all metrics

  → Upserts AnalyticsSnapshot record for (vendorId, date)

  → Updates VendorProfile.rating, completionRate, totalOrders

---

## 9\. Security Design

Security is built in layers. If one layer is bypassed, the next one catches it.

### Layer 1 — Network & Transport

- All traffic over HTTPS — no HTTP permitted  
- CloudFront in front of the API absorbs traffic spikes and acts as the first DDoS buffer  
- CORS explicitly whitelisted to known frontend domains only — all other origins rejected  
- `@fastify/helmet` sets security headers on every response: HSTS, CSP, X-Frame-Options, X-Content-Type-Options

### Layer 2 — Rate Limiting (Redis-backed — works correctly across multiple server instances)

| Endpoint | Limit |
| :---- | :---- |
| POST /api/auth/otp/request | 3 per phone per 10 minutes, then 30-min lockout |
| POST /api/auth/otp/verify | 5 per phone per 10 minutes |
| POST /api/orders | 5 per IP per minute |
| POST /api/webhooks/paystack | 50 per minute (Paystack IPs only — whitelisted) |
| Public GET endpoints | 60 per IP per minute |
| Authenticated endpoints | 200 per userId per minute |

### Layer 3 — Authentication & Sessions

- OTP hashed with bcrypt before Redis storage — raw OTP never persisted  
- Access tokens: JWT RS256, 15-minute expiry — asymmetric signing means public key can verify without exposing the private key  
- Refresh tokens: cryptographically random 64-byte hex, stored as bcrypt hash in DB (never raw), sent only in httpOnly \+ Secure \+ SameSite=Strict cookie  
- Single-use refresh tokens — each use marks the token as used and issues a new one  
- Compromise detection: used token presented again → all tokens for that user revoked immediately  
- Device fingerprint stored with refresh token — mismatched fingerprint flags potential compromise

### Layer 4 — Authorisation

Every protected route checks:

1. Valid JWT (signature \+ expiry)  
2. User is active  
3. User has the required role  
4. User owns the resource being accessed (vendor can only modify their own meals and orders; buyer can only view their own orders)

> **⚠️ CORRECTED (2026-07-15).** The original text read: *"`campusId` is enforced on all queries via
> Prisma middleware — cross-campus data access is impossible at the ORM layer."* **There is no Prisma
> middleware and no ORM-layer enforcement** — Prisma was replaced by Mongoose (§5). `campusId`
> scoping is applied **per query in the service layer**, which means it is only as good as each
> call site: a query that forgets it is not caught by anything. With RLS also gone, there is **no
> second line of defence** behind these checks.

### Layer 5 — Input Validation

Every request body and query parameter runs through Zod schema validation before reaching the service layer. Requests that fail validation are rejected with a `400` before any business logic or database access occurs.

### Layer 6 — Payment Security

- **Webhook signature verification** — every Paystack webhook verified using HMAC-SHA512 before processing. Invalid signature → `401` rejected, logged.  
- **Idempotency** — `idempotencyKey` checked on every webhook. Duplicate webhook → `200` returned silently, no action taken.  
- **Server-side price calculation** — client sends meal IDs, quantities, and fulfillment type only. Server calculates all prices. A client cannot send a manipulated price.  
- **Amount verification** — webhook `amount` verified against `Payment.amountKobo` stored in DB at order creation. Tampered amounts → rejected.  
- **All payment state transitions wrapped in Prisma transactions** — partial updates are impossible.

### Layer 7 — Data

- All IDs are cuid — non-sequential, non-enumerable. Attackers cannot guess or iterate record IDs.  
- Sensitive fields (phone number, bank account number) encrypted at rest using AES-256-GCM before DB storage.  
- S3 bucket policy: no public access. All objects are private. Access only via **short-lived,
  per-request** signed URLs — never a long-lived URL embedded in a JSON payload (see §10 Receipts).  
- ~~Supabase Row Level Security policies on all tables — DB-level enforcement as a final safety net.~~
  **⚠️ CORRECTED (2026-07-15): RLS does not exist.** Postgres was replaced by MongoDB (§5). **There
  is no DB-level final safety net** — authorization is enforced **only** in the application layer, so
  a missed check in a service is a real data leak with nothing behind it to catch it. Treat every
  ownership/campus check as load-bearing.  
- ~~Audit log table has no UPDATE or DELETE permissions for the application database user — enforced via Supabase RLS.~~
  **⚠️ CORRECTED (2026-07-15):** audit immutability is an **app-layer convention only**. See the
  AuditLog note in §6.  
- No sensitive data in logs: no phone numbers, OTP codes, bank account numbers, or raw tokens ever appear in log output.  
- Environment secrets managed via AWS Secrets Manager in production — no `.env` files on production servers.

---

## 10\. Scalability Plan

### MVP — Single Campus (Target: \~500 concurrent users)

- Single ECS Fargate service, 1–2 tasks, auto-scale to 4  
- Supabase Pro plan (dedicated Postgres)  
- Redis: Upstash serverless (scales to zero — no idle cost)  
- S3 \+ CloudFront for media  
- All services in `af-south-1` (Cape Town) — lowest latency for Nigeria

### Growth — Multiple Campuses (Target: \~5,000 concurrent users)

- `campusId` is first-class on every table from day one — zero schema changes needed to support new campuses  
- Fargate auto-scaling: 2–10 tasks based on CPU and request metrics  
- Supabase: upgrade tier, enable read replicas for analytics queries  
- BullMQ workers scaled independently from API servers  
- Prisma read replicas configured for analytics module

### Expansion — Multiple Countries (Target: 30,000+ concurrent users)

- Extract Orders and Payments modules into dedicated services — module boundaries are already clean  
- AWS API Gateway for traffic management, throttling, and WAF  
- Supabase per-country schemas or separate Supabase projects for data residency compliance  
- CDN-cached vendor profile pages (mostly static data)  
- Payment provider configuration per country — Paystack covers Nigeria, Ghana, Kenya. Other countries added via the provider pattern without changing core business logic.

### What Enables This Scale From Day One

- `campusId` on every table — never retrofitted  
- Stateless API — sessions in Redis, any server handles any request, horizontal scaling with no coordination  
- All background work is queue-based — order spikes cannot block API responses  
- Analytics computed from snapshots — never from live order queries  
- Menu item snapshots on orders — vendor menu edits never corrupt historical data  
- Prisma migrations version-controlled — schema changes are safe and reversible

---

## 11\. Development Phases

### Phase 0 — Foundation (Week 1\)

- TypeScript \+ Fastify project scaffold with domain-based folder structure  
- Prisma schema defined, initial migration run against Supabase dev instance  
- Redis (ioredis) \+ BullMQ setup with connection health checks  
- Auth module: buyer registration, vendor registration (3 steps), OTP via Termii, JWT RS256 \+ refresh token rotation  
- Fastify plugin architecture: auth hook, rate limiter, error handler, Pino structured logger  
- AWS S3 client: pre-signed URL generation utility  
- Supabase Realtime: subscription setup for vendor order feed  
- Docker \+ docker-compose: API \+ Redis \+ local Postgres for development  
- GitHub Actions CI: lint → type-check → Prisma validate on every PR  
- AWS Secrets Manager integration for production config

### Phase 1 — Core Product (Weeks 2–3)

- Vendor module: profile CRUD, dashboard onboarding checklist, completeness scoring, status transitions  
- Menu Builder: category management, menu item CRUD, availability toggle, sold-out toggle, soft delete  
- Timetable system: weekly schedule CRUD, order template generation  
- Campus \+ location seeding: Nigerian universities and polytechnics list, states list  
- Daily order creation: full 4-step flow, shareable token \+ link generation, draft/publish  
- Buyer order flow: order page, item selection, checkout, fulfillment selection, delivery address capture  
- Payment module: Paystack initialise transaction with split (₦100 platform fee), webhook handler (signature verify, idempotency, amount verify, atomic slot increment)  
- BullMQ jobs: cutoff.enforce, cutoff.warning  
- Order state machine: all transitions enforced, cancellation logic, automatic refund trigger  
- Supabase Realtime: vendor dashboard live order feed subscription

### Phase 2 — Discovery & Notifications (Week 4\)

- Marketplace: campus feed, vendor directory, vendor public profile page, status badges  
- Vendor timetable visible on public profile  
- Full notification system: BullMQ workers for SMS (Termii) and email (Resend)  
- All notification events wired to order state transitions  
- Digital receipt generation: PDF → S3 → email \+ SMS delivery  
- Buyer order history and "Order Again" feature  
- Shareable link landing page (no auth to view, auth required to order)  
- Analytics.aggregate BullMQ daily job  
- Vendor analytics dashboard reading from AnalyticsSnapshot

### Phase 3 — Reviews, Admin & Polish (Week 5\)

- Ratings and reviews: submission flow, 24hr prompt, display on vendor profile, rating recomputation  
- Review moderation: flag, remove, vendor report  
- Super Admin panel: campus management, vendor management, order oversight, review moderation, platform-wide analytics  
- Profile completeness gate enforced on marketplace visibility  
- "Order Again" shortcut fully wired to current menu availability

### Phase 4 — Hardening & Production (Week 6\)

- Load testing with k6: order placement flow, payment webhook, marketplace feed under concurrent load  
- Security audit: OWASP Top 10 checklist, npm audit, Prisma query review  
- CloudWatch dashboards: Fargate CPU/memory, BullMQ queue depth, API p95 latency, error rate  
- Sentry integration: source maps uploaded, error context includes userId \+ orderId \+ route  
- Terraform: production ECS Fargate, ElastiCache, S3 \+ CloudFront, Secrets Manager, IAM roles  
- Staging environment with production-parity Supabase instance  
- Runbook: deployment procedure, rollback steps, incident response, BullMQ job retry policy  
- Penetration test checklist: auth bypass, IDOR, payment manipulation, webhook replay

---

## 12\. Open Decisions Log

| \# | Decision | Status | Notes |
| :---- | :---- | :---- | :---- |
| 1 | Menu item variants | ✅ Decided | Phase 1: one item, one flat price. Phase 2: size/protein variants |
| 2 | Vendor type structure | ✅ Decided | One vendor type, cosmetic tag only |
| 3 | Delivery logistics | ✅ Decided | Vendor handles own delivery — PreChop collects fee via Paystack |
| 4 | Delivery fee in payment | ✅ Decided | Added to Paystack total at checkout, non-refundable after PREPARING |
| 5 | Paystack settlement | ✅ Decided | Subaccounts — created during vendor bank details step |
| 6 | Buyer identity | ✅ Decided | First name \+ last name \+ phone only — no email, no matric number |
| 7 | Vendor approval gate | 🔄 **REVERSED 2026-07-15** | ~~No manual approval — auto-ACTIVE when profileCompleteness \= 100%~~ → **Manual admin approval gate.** INCOMPLETE → (submit) → PENDING\_REVIEW → admin approve (→ACTIVE) / reject(reason) (→CHANGES\_REQUESTED) → resubmit. Completeness no longer auto-activates. Submission gates on the **onboarding checklist**, not on completeness ≥100 — that score requires menu items \+ timetable, which are themselves behind the active-vendor gate, so scoring on 100% **deadlocked every applicant at ~60%**. `profileCompletenessRequired` is informational only. See §6 |
| 8 | User roles | ✅ Decided | Three roles only: BUYER, VENDOR, SUPER\_ADMIN |
| 9 | Location model | ✅ Decided | Campus-scoped. ON\_CAMPUS: school \+ hostel/stall. OFF\_CAMPUS: state \+ area |
| 10 | Auth method | ✅ Decided | Phone \+ OTP only. No passwords. No email login. |
| 11 | Platform fee | 🔄 **REVERSED 2026-07-15** | ~~₦50 from buyer \+ ₦100 from vendor \= ₦150 per order~~ → **Percentage model.** Buyer pays **3% of food subtotal, capped at ₦200** (added to checkout total); vendor pays **8%** (deducted from settlement). **Admin-governed** via `siteConfigs.platformFeeBuyerPercent` / `platformFeeBuyerMaxKobo` / `platformFeeVendorPercent`, with env (`PLATFORM_FEE_*`) as fallback — an admin change needs **no redeploy**. An invalid config falls back loudly to the standing rate, never to 0. The old flat `platformFee*Kobo` fields are **retired** — they defaulted to 0 and were read by nothing. See §8.9 |
| 12 | Buyer campus scope | ✅ Decided | Buyer sees only vendors near their selected campus |
| 13 | Email provider | ✅ Decided | Resend for all transactional email |
| 14 | Push notifications | ✅ Decided | Not in Phase 1\. SMS (Termii) handles all critical alerts. FCM considered for Phase 2\. |
| 15 | Multi-vendor cart | ⏳ Pending | Single-vendor per order in Phase 1\. Multi-vendor cart in Phase 2\. |
| 16 | Minimum order amount | ⏳ Pending | Decide: platform-wide minimum or per-vendor setting |
| 17 | School dropdown seed data | ⏳ Pending | Need full list of Nigerian universities and polytechnics |
| 18 | WhatsApp TV boost monetisation  | ⏳ Pending  | Phase 1 is free/manual. Phase 2 commission rate and TV onboarding flow TBD  |

---

*PreChop PRD v3.0 — Final, with as-built corrections applied 2026-07-15*  
*Auth: Phone \+ OTP · Platform fee: 3% buyer (cap ₦200) \+ 8% vendor · Vendor go-live: manual admin approval*  
*Stack (as built): Next.js 16 App Router · MongoDB \+ Mongoose · Redis · node-cron · Paystack · Sendchamp · Resend · AWS S3*

> **Reading this PRD.** Sections marked **⚠️ CORRECTED** were verified against the implementation on
> 2026-07-15 and reversed where the PRD was wrong. The original wording is quoted in each note so the
> reversal is traceable — a silent edit loses the *why* and invites someone to reverse it back. Where
> a correction and the body text disagree, **the correction wins**. Corrected: technology stack (§5),
> vendor approval gate (§6, §8.1, Decision 7), platform fee model (§6, §8.9, Decision 11), New Vendor
> rating gate (§8.6/§8.12), vendor earnings (§8.1).  
