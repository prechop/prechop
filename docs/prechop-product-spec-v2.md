# PreChop — Product Specification
### Campus Food Pre-Order Platform · v2.0

> **"Order before they cook. Never miss your vendor's best meal."**

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Brand Identity](#2-brand-identity)
3. [Users & Roles](#3-users--roles)
4. [Information Architecture](#4-information-architecture)
5. [Data Model — Plain English](#5-data-model--plain-english)
6. [Vendor Flow — Full Detail](#6-vendor-flow--full-detail)
7. [Customer Flow — Full Detail](#7-customer-flow--full-detail)
8. [Payment Architecture](#8-payment-architecture)
9. [Cutoff & Auto-Close System](#9-cutoff--auto-close-system)
10. [Notification System](#10-notification-system)
11. [Receipt System](#11-receipt-system)
12. [Fulfillment & Delivery System](#12-fulfillment--delivery-system)
13. [API Routes](#13-api-routes)
14. [Edge Cases & Error Handling](#14-edge-cases--error-handling)
15. [Dispute Resolution](#15-dispute-resolution)
16. [Pricing Model](#16-pricing-model)
17. [Tech Stack](#17-tech-stack)
18. [MVP Build Timeline](#18-mvp-build-timeline)
19. [Scale Roadmap](#19-scale-roadmap)
20. [Campus Launch Playbook](#20-campus-launch-playbook)
21. [Environment Variables](#21-environment-variables)

---

## 1. Product Vision

### The Problem

Campus food vendors in Nigerian universities — students selling jollof rice, drinks, snacks, yoghurt, cakes, small chops — currently manage pre-orders entirely through WhatsApp Status. They post something like:

> *"Cooking fried rice tomorrow 🍛 Place your order now, DM me 📲"*

What follows is chaos:
- Orders arrive as DMs scattered across 30 conversations
- Vendors track quantities in notebooks or their head
- Customers ghost — they ordered, never showed up
- Vendors overcook and waste food and money
- No payment collected upfront — no commitment, no accountability

**PreChop** replaces the notebook and the DM chaos with a tool so simple it feels like an extension of WhatsApp itself.

### The Solution

A mobile-first web app where:
- Vendors choose a category and create a meal listing in under 2 minutes
- For cooked meals, vendors set a base price and list optional extras with individual prices
- A shareable link is generated — they post it on WhatsApp Status instead of text
- Customers click the link, order, customize their plate, and pay immediately
- The vendor sees a live dashboard of confirmed, paid orders with each customer's selections
- At cutoff time — set by the vendor — the listing closes automatically
- The vendor cooks exactly the right quantity with zero guesswork
- Customers receive a digital receipt with their 4-digit pickup code
- Customers can share their receipt to the vendor via WhatsApp as proof of payment

### Design Philosophy

**Feels like WhatsApp, performs like Paystack.**

- No jargon. No "dashboard" or "merchant portal" language. Use words like *your orders*, *your meals*, *who's coming*.
- Naija-native copy. "How many plates?" not "Enter quantity."
- Mobile-first, data-light. Every page under 200kb initial load.
- Zero friction for customers. No app download. No account creation. Phone number is identity.
- Trust signals everywhere. Paystack logo, receipt confirmation, pickup codes. Students are skeptical — earn trust fast.

---

## 2. Brand Identity

### Name
**PreChop** — from Nigerian Pidgin: *"chop"* means to eat. *"Pre"* signals the pre-order mechanic. Direct, fun, accurate.

### Tagline
*"Order before they cook."*

### Voice & Tone

| Context | Tone | Example |
|---|---|---|
| Vendor onboarding | Warm, encouraging | "You're almost set! Add your bank details so we can send your money." |
| Order page | Appetizing, urgent | "15 plates left. Order now before it sells out." |
| Confirmation | Celebratory, clear | "You're in! Your Jollof Rice is confirmed. Show code **4821** when you arrive." |
| Cutoff reached | Honest, soft | "Sorry, orders for this meal are closed. Follow this vendor to catch the next one." |
| Error states | Direct, helpful | "That didn't work. Try again or use a different card." |
| Empty states | Playful | "No orders yet. Share your link on Status and watch them roll in." |
| Delivery confirmed | Warm, clear | "On the way! Amaka is bringing your order. She'll call when she's close." |

### Color Palette

```
Primary Green   #1B8A4C   — trust, food, Nigeria
Accent Orange   #F47C20   — energy, appetite, urgency
Off White       #FAF9F6   — background, warmth
Dark            #1A1A1A   — text
Muted           #6B7280   — secondary text
Success         #16A34A   — confirmations, paid states
Warning         #CA8A04   — cutoff warnings, low stock
Danger          #DC2626   — errors, failed payments
```

### Typography

```
Display / Headers   — Clash Display (Google Fonts) — bold, modern
Body / UI           — Inter — clean, readable on small screens
Monospace           — JetBrains Mono — pickup codes, amounts
```

### Logo Concept
A bowl of jollof rice with a clock hand — food + time = pre-order. Simple enough to work as a WhatsApp profile icon at 40×40px.

---

## 3. Users & Roles

### 3.1 Vendor

A student or campus-based seller who makes food and sells to other students. They:
- Sign up once with their name, phone, campus, and bank account
- Choose a category every time they create a new meal listing
- Set their own cutoff time and fulfillment method per listing
- For cooked meals — list a base price and optional extras with prices
- Share the auto-generated link on WhatsApp Status or anywhere their audience is
- Monitor live orders on their dashboard with each customer's extra selections
- Cook based on confirmed paid orders and exact customer preferences
- Verify customer pickup with a code or mark deliveries as fulfilled
- Receive money automatically after each payment

**Vendor mental model:** PreChop is their WhatsApp Status upgrade. They were already posting — now the post comes with a payment button, a real order list, and a cutoff timer they control.

### 3.2 Customer

A student or campus community member who orders food. They:
- Click a link shared by a vendor
- See the meal, price, category, slots remaining, and fulfillment options
- For cooked meals — select optional extras they want added to their order
- Choose pickup or delivery
- Leave an optional message for the vendor
- Pay via Paystack
- Receive a digital receipt with their 4-digit pickup code
- Share receipt to vendor via WhatsApp as proof of payment

**Customer mental model:** Like buying from a vendor's Instagram, but with a real payment link, customizable order, and a proper receipt.

### 3.3 Platform Admin (Internal)

The PreChop team. Can:
- View all vendors, meals, and orders across the platform
- Handle disputes and refund requests
- Monitor Paystack webhook health
- Manually close or pause listings
- Verify vendor accounts
- View revenue dashboard and payout log

The admin panel is a minimal internal tool — built in v1 to create proper audit trails from day one. Three core screens: vendor management, order management, payout log.

---

## 4. Information Architecture

```
prechop.ng/
│
├── / (Landing page)
│   ├── Hero — "Order before they cook"
│   ├── How it works — vendor side (3 steps)
│   ├── How it works — customer side (3 steps)
│   ├── Vendor signup CTA
│   └── Footer
│
├── /signup (Vendor registration)
│   ├── Step 1: Basic info (name, phone, campus)
│   ├── Step 2: OTP verification (6-digit SMS)
│   └── Step 3: Bank details (for payout)
│
├── /login (Vendor OTP login)
│   ├── Phone number entry
│   └── OTP verification (6 digits via SMS)
│
├── /dashboard (Vendor home — authenticated)
│   ├── Active meals with live order counts
│   ├── Past meals
│   ├── Total earnings this month
│   └── Quick action: "+ New Meal"
│
├── /meals/new (Create meal listing)
│   ├── Step 1: Choose category (3 tabs)
│   ├── Step 2: Meal details form (fields change per category)
│   ├── Step 3: Fulfillment setup (pickup / delivery / both)
│   └── Step 4: Preview before publishing
│
├── /meals/[id] (Vendor meal detail — authenticated)
│   ├── Live order list with extras per customer (Cooked Meals)
│   ├── Cutoff countdown
│   ├── Pickup verification input
│   ├── Delivery status management
│   └── Earnings for this meal
│
├── /order/[slug] (Customer order page — PUBLIC)
│   ├── Meal photo, name, vendor name, category
│   ├── Price, slots remaining, cutoff countdown
│   ├── Extras selector (Cooked Meals only)
│   ├── Fulfillment selector (pickup / delivery)
│   ├── Order form (name, phone, quantity, address if delivery)
│   ├── Optional message to vendor
│   └── Paystack checkout — total updates live
│
├── /order/[slug]/success (Post-payment confirmation + Receipt)
│   ├── Order summary with extras
│   ├── Pickup code or delivery confirmation
│   ├── Save receipt as image
│   ├── Share receipt to WhatsApp
│   └── Save vendor's contact
│
├── /order/[slug]/receipt/[orderId] (Standalone receipt page)
│   ├── Full receipt with extras breakdown
│   ├── Refund status (if applicable)
│   └── Share and download options
│
├── /order/[slug]/closed (Listing closed state)
│   └── Option to save vendor's contact
│
└── /admin (Internal — staff only)
    ├── Vendor list + verification
    ├── Order list + dispute management
    └── Payout log
```

---

## 5. Data Model — Plain English

This section describes what data PreChop stores and how the pieces relate to each other. The engineering team will decide the exact database implementation, schema syntax, and tooling. What matters here is the shape of the data and the business rules behind it.

---

### Vendor

Every person who sells on PreChop has a vendor record. It stores their full name, phone number (their login identity), optional WhatsApp number, campus, university, and their Nigerian bank account details for payouts.

The system creates a Paystack subaccount for every vendor on signup — this is what enables automatic payment splitting so the vendor gets paid directly without PreChop holding their money.

A vendor has two status flags: **verified** (has the team confirmed this is a legitimate seller) and **active** (is their account in good standing). There is also a **first payout held** flag — the very first payout a new vendor earns is held for 24 hours as a fraud buffer before being released.

---

### Meal

A meal is a single listing a vendor creates for one batch of food on one date. Every meal belongs to a vendor.

Key fields:
- **Title and description** — what the food is
- **Category** — one of three: Cooked Meal, Drink & Yoghurt, or Snack & Pastry. This controls what the customer sees on the order page.
- **Base price** — the price of the standard item with nothing added
- **Maximum quantity** — how many the vendor can make
- **Orders count** — a running total of how many slots are taken. This is kept in sync with actual orders so the system can check availability instantly without counting every time.
- **Available date** — the date the food will be ready
- **Cutoff time** — the vendor-set deadline after which no more orders are accepted. Stored as a full timestamp.
- **Status** — Open, Closed, Cancelled, or Fulfilled
- **Fulfillment type** — whether the vendor offers Pickup, Delivery, or Both
- **Collection point** — a text description of where customers come to collect (for pickup)
- **Delivery fee** — how much extra delivery costs (can be zero)
- **Delivery coverage** — a text description of where the vendor delivers to
- **Photo** — an image uploaded to cloud storage
- **Slug** — the unique URL-friendly identifier used in the public link

---

### Meal Extra

Only applies to Cooked Meal listings. A vendor can attach up to 6 extras to a meal. Each extra has:
- **Name** — what it is (e.g. Fish, Plantain, Salad)
- **Price** — how much it adds to the order total
- **Available** — a toggle the vendor can switch off if they run out mid-day without cancelling the whole listing

Extras belong to a meal. When a meal is cancelled or closed, its extras become irrelevant but remain in the record for history.

---

### Customer

Every person who orders on PreChop is tracked as a customer by their phone number. The system stores their name and phone. When a returning customer enters their phone number on a new order page, their name is pre-filled automatically — reducing friction on repeat purchases.

Customers do not have passwords or accounts. Their phone number is their identity.

---

### Order

An order is created the moment a customer taps the pay button — before payment is confirmed. It starts with a status of **Pending Payment**.

Key fields:
- **Meal** — which listing this order belongs to
- **Customer** — who placed the order
- **Quantity** — how many units ordered
- **Selected extras** — a record of which extras the customer chose (for Cooked Meals)
- **Total** — the final amount: (quantity × base price) + sum of selected extras + delivery fee if applicable
- **Fulfillment type** — whether this specific order is pickup or delivery
- **Delivery address** — required if fulfillment type is delivery
- **Pickup code** — a 4-digit code unique within this meal listing. Used by the vendor to verify collection. Not generated for delivery orders.
- **Customer message** — the optional note the customer left for the vendor (max 150 characters)
- **Status** — Pending Payment → Paid → Out for Delivery (if delivery) → Fulfilled, or Cancelled, or Refunded
- **Timestamps** — when the order was placed, when it was paid, when it was fulfilled

---

### Order Extra (Join Record)

When a customer selects extras, each selection is stored individually. This record links an order to a specific extra and captures the price at the time of ordering — so if a vendor changes an extra's price later, historical orders still show the correct amount that was charged.

---

### Payment

Every order has at most one payment record. The payment stores:
- The Paystack transaction reference — a unique identifier used to match webhook events back to the right order
- The total amount charged to the customer
- The platform fee (₦75)
- The vendor's portion
- Payment status — Pending, Success, Failed, or Refunded
- Timestamps for when payment was confirmed and when it was refunded

The payment record is what gets updated when Paystack fires a webhook. The order status is updated in the same database transaction so they are always in sync.

---

### Notification

Every SMS sent through the platform is logged. Each notification record tracks which order it belongs to, whether it was sent to the vendor or the customer, the message content, the channel (SMS or WhatsApp in future), and whether it was successfully delivered.

This log is essential for dispute resolution — if a customer claims they never received a confirmation, the team can check whether the SMS was sent and delivered.

---

### Dispute

When a vendor or customer reports a problem, a dispute record is created. It stores who raised it, their reason, the current status (Open, Investigating, Resolved), the admin's resolution note, and timestamps. Every dispute is linked to a specific order so the full context is always available.

---

### Key Business Rules in the Data

**Slot management:** When an order is created, the meal's orders count is incremented immediately — even before payment is confirmed. This holds the slot for 10 minutes while the customer completes payment. If payment is not confirmed within 10 minutes, the order is cancelled and the slot is released. This prevents two customers from both being told a slot is available when only one remains.

**Race condition protection:** When two customers try to take the last slot at the same moment, the database must handle this safely. The system locks the meal record during the slot check and order creation so only one transaction can proceed. The other customer gets a clear error message.

**Extras pricing locked at order time:** The price of each extra is copied onto the order record at the moment of ordering, not looked up later. This means vendor price changes never affect past orders.

**Cutoff enforcement is dual-layered:** The API checks the cutoff time on every incoming order request and rejects orders past the deadline. A background job also sweeps for expired listings every few minutes and updates their status, so vendor dashboards flip to cooking mode automatically without waiting for an order attempt.

**Pickup code uniqueness:** Codes are unique within a single meal listing — not globally. Vendor A and Vendor B can both have a customer with code 4821. The vendor only verifies codes for their own listing, so there is no conflict.

**Idempotent webhooks:** Paystack may occasionally send the same payment confirmation more than once. The system checks whether a payment is already marked as successful before processing — if it is, the duplicate event is acknowledged and ignored. This prevents double-fulfillment or double-notifications.

---

## 6. Vendor Flow — Full Detail

### 6.1 Onboarding (One-time)

#### Step 1: Landing Page → Sign Up

Vendor arrives at `prechop.ng`, sees the hero, clicks **"Start taking orders"**, lands on `/signup`.

#### Step 2: Basic Info Form

```
Full name
Phone number        (becomes their login — Nigerian format validated)
WhatsApp number     (optional — defaults to phone number)
Campus / School     (dropdown of Nigerian universities + "Other")
```

If phone already exists in the system → redirect to login with message:
*"You already have an account. Log in instead."*

#### Step 3: OTP Verification

- 6-digit code sent via SMS to the vendor's phone number immediately after form submission
- Vendor enters the code to confirm their number is real and accessible
- Code expires after 10 minutes
- Vendor can request a resend after 60 seconds

#### Step 4: Bank Details Form

```
Bank name           (dropdown — fetched from Paystack's bank list)
Account number      (10-digit NUBAN)
Account name        (auto-filled by Paystack account lookup on blur)
```

On submission:
1. Account is validated against Paystack's bank resolve API
2. A Paystack subaccount is created for the vendor
3. The subaccount code is stored on the vendor record
4. First payout held flag is set to true
5. Vendor is taken to their dashboard with the prompt to create their first meal

---

### 6.2 Creating a Meal Listing

Route: `/meals/new` (authenticated)

#### Step 1 — Choose Category (3 Tabs)

The vendor sees three tabs at the top of the form. They pick one before filling in any other details. The tab they choose determines what fields appear below.

```
┌──────────────────────────────────────────────┐
│  🍛 Cooked Meals  │  🥤 Drinks & Yoghurt  │  🍿 Snacks & Pastries  │
└──────────────────────────────────────────────┘
```

The category is stored on the meal record. It controls:
- Whether the extras section appears (Cooked Meals only)
- How the order page renders for customers

---

#### Step 2 — Meal Details

**Fields for ALL categories:**

```
Meal title          (text — max 60 chars)
                    Placeholder: "Jollof rice with chicken"

Description         (textarea — optional, max 200 chars)
                    Placeholder: "Party jollof, smoky and peppery 🔥"

Price (₦)           (number)
                    Label: "How much for one order?"

Maximum orders      (number)
                    Helper: "How many can you make?"

Available date      (date — today or future)
                    Label: "When will it be ready?"

Order cutoff time   (date + time)
                    Label: "When should ordering close?"
                    Helper: "Most vendors set cutoff 2–3 hours before they start cooking."
                    Validation: cannot be in the past, cannot be after available date

Meal photo          (image upload — optional but strongly recommended)
```

---

**Additional section for Cooked Meals only — Optional Extras:**

Below the main form fields, a section appears:

```
── OPTIONAL EXTRAS ─────────────────────────────────
  Let customers add to their order (up to 6 items)

  [+ Add extra item]

  Once added, each item shows:
  Item name: [__________]    Price (₦): [______]   [Remove]

  Example entries:
  Fish          ₦600
  Plantain      ₦200
  Salad         ₦300
  Extra chicken ₦500

  ℹ️ Customers pay your base price plus whatever extras they select.
     You can mark any extra as unavailable from your dashboard later.
────────────────────────────────────────────────────
```

Rules:
- Maximum 6 extras per listing
- Each extra requires a name and a price
- Extras are optional — vendor does not have to add any
- If no extras are added, the customer order page shows only the base item

---

#### Step 3 — Fulfillment Setup

Applies to all categories:

```
How will customers receive their order?

○ Pickup only
○ Delivery only
○ Both (customer chooses)

  If Pickup or Both:
  Collection point: [________________________]
  Placeholder: "Block C canteen, beside the tuck shop"

  If Delivery or Both:
  Delivery fee (₦): [______]   (enter 0 for free delivery)
  Coverage area:    [________________________]
  Placeholder: "I deliver within Moremi Hall and Sabo area only"
```

---

#### Step 4 — Preview & Publish

Vendor sees a mobile preview of exactly what the customer will see before publishing. Includes meal photo, title, price, extras list, fulfillment details, and countdown timer showing time until cutoff.

Two buttons: **Edit** and **Publish**.

On publish, the shareable link is shown:

```
✅ Your meal is live!

Jollof Rice Friday
₦2,000 base · Closes Thursday 10pm
📍 Pickup: Block C canteen

prechop.ng/order/jollof-rice-friday-amaka-obi-k3m9xz

[Copy link]   [Share to WhatsApp Status]
```

The **Share to WhatsApp Status** button opens WhatsApp with a pre-written message and the link ready to post.

---

### 6.3 Vendor Dashboard

Route: `/dashboard` (authenticated)

```
Header: PreChop logo  |  Hi Amaka 👋  |  Menu

── THIS MONTH ──────────────────────────────────
  Total earned: ₦184,500        Orders: 74

── ACTIVE MEALS ────────────────────────────────
  [Meal Card]
  [Meal Card]

── PAST MEALS ──────────────────────────────────
  [Collapsed list]
```

#### Meal Card

```
┌────────────────────────────────────────────┐
│ 📸 [photo]    Jollof Rice Friday           │
│               🍛 Cooked Meal · ₦2,000      │
│                                            │
│  22 orders    ₦55,000 collected            │
│  8 slots left  Closes in 4h 22m            │
│  📍 Pickup (18)  🛵 Delivery (4)           │
│                                            │
│  [View orders]    [Copy link]              │
└────────────────────────────────────────────┘
```

Order count and slot count update in real time via Supabase Realtime subscriptions. The countdown timer counts down live. The timer turns amber under 1 hour and red under 15 minutes.

---

### 6.4 Vendor Meal Detail Page

Route: `/meals/[id]` (authenticated)

#### Before Cutoff — Live Orders View

For Cooked Meals, the orders table shows each customer's extras selection clearly:

```
Jollof Rice Friday · ₦2,000 base
Closes in 2h 14m  ·  22 orders  ·  8 slots left

[Pickups (18)]  [Deliveries (4)]

── PICKUPS ──────────────────────────────────────────────────────
  #   Name              Qty   Extras              Total    Note
  1   Chidinma Okafor   2     Fish, Plantain       ₦5,600  "less pepper please"
  2   Tunde Adeleke     1     None                 ₦2,000
  3   Blessing Nwosu    1     Salad, Extra chicken ₦3,300  "no onions"
  ...

Total confirmed: ₦55,000 from 22 orders
```

For Drinks & Snacks, the extras column is not shown — just name, quantity, total, and note.

#### After Cutoff — Cooking Mode

```
🍳 COOKING MODE — Orders closed

Jollof Rice Friday
Cook 22 plates total  (18 pickup · 4 delivery)

── EXTRAS SUMMARY ──────────────────────────
  Fish:          9 portions needed
  Plantain:      14 portions needed
  Salad:         6 portions needed
  Extra chicken: 4 portions needed

── PICKUPS — WHO'S COMING ──────────────────
  Code   Name              Qty   Extras              Note
  4821   Chidinma Okafor   2     Fish, Plantain       "less pepper"
  3304   Tunde Adeleke     1     None
  ...

── MARK AS COLLECTED ───────────────────────
  Enter pickup code: [____]   [Mark ✓]
```

The **Extras Summary** block is the key feature for vendors — they see at a glance exactly how many of each extra they need to prepare before cooking starts. No mental math, no re-reading every order.

For Drinks & Snacks there is no extras summary — just the pickup list.

#### Delivery Tab (After Cutoff)

```
── DELIVERIES ──────────────────────────────────────────────
  Name            Qty   Extras          Address              Action
  Kemi Adebayo    2     Fish, Salad     Sabo Junction        [Mark Delivered]
  Yemi Okon       1     None            Room 4, Angola Hall  [Mark Delivered]
```

Vendor can tap a customer name to dial them directly from the dashboard.

---

### 6.5 Managing Extras Availability Mid-Day

From the meal detail page, before cutoff, the vendor can mark individual extras as unavailable without cancelling the listing:

```
── EXTRAS AVAILABILITY ─────────────────────
  ✅ Fish         ₦600    [Mark unavailable]
  ✅ Plantain     ₦200    [Mark unavailable]
  ❌ Salad        ₦300    Unavailable  [Restore]
```

When an extra is marked unavailable:
- It is hidden from the customer order page immediately
- Any customer currently viewing the page will see it grayed out and unselectable on their next interaction
- Existing orders that already include that extra are not affected

---

### 6.6 Vendor Notifications

| Event | Message |
|---|---|
| New pickup order | *"PreChop: New order! Chidinma — 2x Jollof Rice + Fish, Plantain (₦5,600). Total: 22 orders."* |
| New delivery order | *"PreChop: Delivery order! Kemi Adebayo — 1x Zobo (₦1,500). Deliver to: Sabo Junction."* |
| Listing hits 80% | *"PreChop: Almost full! 24/30 slots taken. Only 6 left."* |
| Sold out | *"PreChop: Sold out! All 30 slots are taken."* |
| Cutoff reached | *"PreChop: Orders closed for Jollof Rice Friday. 22 paid orders. View cooking list: prechop.ng/meals/[id]"* |
| Cutoff changed after orders exist | *"PreChop: Cutoff updated. All existing customers have been notified of the change."* |

---

## 7. Customer Flow — Full Detail

### 7.1 Discovery

Customer sees the vendor's WhatsApp Status post with the PreChop link. Taps it. Browser opens the order page instantly. No app download. No account creation required.

---

### 7.2 Order Page — `/order/[slug]`

#### Cooked Meal Listing

```
┌──────────────────────────────────────┐
│ [Full-width meal photo]              │
│                                      │
│ Jollof Rice Friday                   │
│ by Amaka Obi · UNILAG               │
│ 🍛 Cooked Meal                       │
│                                      │
│ ₦2,000 per plate                     │
│ ⏱ Closes in 4h 22m                  │
│ 🍽 8 plates left                     │
│                                      │
│ ─────────────────────────            │
│                                      │
│ Your name                            │
│ [________________________]           │
│                                      │
│ Phone number                         │
│ [________________________]           │
│                                      │
│ How many plates?                     │
│ [−]  1  [+]                          │
│                                      │
│ ── Add extras? (optional) ─────────  │
│                                      │
│ ☐  Fish            +₦600             │
│ ☐  Plantain        +₦200             │
│ ☐  Salad           +₦300             │
│ ☐  Extra chicken   +₦500             │
│                                      │
│ Note: extras apply per plate         │
│                                      │
│ ─────────────────────────            │
│                                      │
│ How do you want to receive it?       │
│ ○ 📍 Pickup — Free                   │
│    Block C canteen                   │
│ ○ 🛵 Delivery — +₦200                │
│    Moremi Hall and Sabo area         │
│                                      │
│ [Delivery address field if selected] │
│                                      │
│ ─────────────────────────            │
│                                      │
│ Message for vendor (optional)        │
│ [                               ]    │
│ [  e.g. "less pepper please"    ]    │
│ Max 150 characters                   │
│                                      │
│ ─────────────────────────            │
│                                      │
│ Total: ₦2,000                        │
│ ↓ updates live as customer selects   │
│ Total: ₦3,100  (+ Fish + Plantain    │
│                 + Delivery)          │
│                                      │
│ [   Order & Pay ₦3,100   ]          │
│                                      │
│ 🔒 Secured by Paystack               │
└──────────────────────────────────────┘
```

**Extras behaviour:**
- Extras are optional — customer can ignore this section entirely and pay base price
- Checking an extra adds its price to the running total immediately
- If vendor has marked an extra as unavailable, it appears grayed out and cannot be selected
- Extras apply per plate — if customer orders 2 plates and selects Fish, the total adds ₦600 × 2

#### Drinks & Yoghurt / Snacks & Pastries Listing

Same layout as above but without the extras section entirely. Cleaner, simpler page for fixed items. Fulfillment selector (pickup or delivery) still appears for all categories.

---

### 7.3 Payment Flow

When customer taps **Order & Pay**:

1. A pending order is created on the server with all details — quantity, selected extras, fulfillment type, delivery address, customer message
2. Slot is held immediately (orders count incremented)
3. Paystack inline checkout opens
4. Customer completes payment inside the Paystack popup
5. On payment success, customer is redirected to the success page
6. Paystack fires a webhook to the server confirming the payment
7. Server updates the order to PAID and fires SMS notifications to both customer and vendor

**Important:** The order is not confirmed until the webhook fires. The success page shows a holding message immediately and updates once the webhook is processed. In practice this happens within seconds.

If the customer closes the Paystack popup without paying, their slot is held for 10 minutes then released automatically.

---

### 7.4 Success Page + Receipt — `/order/[slug]/success`

#### Pickup Order (Cooked Meal with extras)

```
┌──────────────────────────────────────┐
│          ✅                          │
│   You're in!                         │
│                                      │
│   Jollof Rice Friday                 │
│   by Amaka Obi · UNILAG             │
│                                      │
│   2 plates                           │
│   + Fish (×2)          ₦1,200        │
│   + Plantain (×2)      ₦400          │
│   ───────────────────────            │
│   Total paid:          ₦5,600        │
│                                      │
│   Your pickup code                   │
│ ┌──────────────────────────┐         │
│ │           4821           │         │
│ └──────────────────────────┘         │
│   Show this to Amaka when you arrive │
│                                      │
│   📍 Block C canteen, beside tuck    │
│   📅 Friday                          │
│   📞 Vendor: 08012345678             │
│                                      │
│   Your note: "less pepper please" ✓  │
│                                      │
│   Order #: PCH-00142                 │
│   Paid: 25 Jun 2026, 3:42pm          │
│                                      │
│  [💾 Save Receipt as Image]          │
│  [📤 Share Receipt on WhatsApp]      │
│  [📞 Save Amaka's Number]            │
│                                      │
│  Receipt sent to your phone ✓        │
└──────────────────────────────────────┘
```

#### Delivery Order

```
│          ✅                          │
│   Order confirmed!                   │
│                                      │
│   Jollof Rice Friday                 │
│   1 plate + Salad      ₦2,300        │
│   Delivery fee         ₦200          │
│   ───────────────────────            │
│   Total paid:          ₦2,500        │
│                                      │
│   🛵 Delivering to:                  │
│   Room 14, Moremi Hall               │
│                                      │
│   Amaka will call when on the way.   │
│   📞 Vendor: 08012345678             │
│                                      │
│  [💾 Save Receipt as Image]          │
│  [📤 Share Receipt on WhatsApp]      │
```

---

### 7.5 WhatsApp Receipt Share

One tap opens WhatsApp with:

```
✅ Order confirmed on PreChop!

Jollof Rice Friday — 2 plates
+ Fish, Plantain
Vendor: Amaka Obi (UNILAG)
Total paid: ₦5,600
Pickup code: 4821
📍 Block C canteen

Order #PCH-00142
prechop.ng/order/.../receipt/[orderId]
```

Customer can send this directly to the vendor as proof of payment or share it anywhere.

---

### 7.6 Closed / Sold Out States

**Sold out:**
```
😔 Sold out
All plates of Jollof Rice Friday are taken.
Follow Amaka to catch her next meal:
[Save Amaka's Number]
```

**Past cutoff:**
```
⏰ Orders are closed
Ordering closed at 10pm Thursday.
Want to know when Amaka cooks next?
[Save Amaka's Number]
```

---

## 8. Payment Architecture

### 8.1 How Payments Split

PreChop uses Paystack's subaccount model. Every vendor has a Paystack subaccount linked to their bank account. When a customer pays, the money is split automatically at the point of transaction — PreChop's ₦75 platform fee goes to the main PreChop account, and the vendor's share goes directly to their subaccount. Paystack then settles the vendor's subaccount to their bank account on Paystack's normal settlement schedule.

Vendors never see PreChop's fee deducted as a separate transaction — it is taken before they receive anything, cleanly and invisibly.

**Example — ₦2,000 base + Fish (₦600) + Plantain (₦200) = ₦2,800 order:**
```
Customer pays:         ₦2,800
PreChop fee:          −₦75
Paystack fee (~1.5%): −₦42  (borne by vendor subaccount)
Vendor receives:       ₦2,683
```

**Example — ₦2,800 order + ₦200 delivery = ₦3,000:**
```
Customer pays:         ₦3,000
PreChop fee:          −₦75
Paystack fee (~1.5%): −₦45
Vendor receives:       ₦2,880
```

The delivery fee is included in the total payment. It is not a separate transaction. The vendor receives the delivery fee as part of their settlement.

### 8.2 Subaccount Creation

When a vendor completes signup and bank details are verified, the system calls Paystack's subaccount creation API with the vendor's business name, bank code, and account number. The subaccount code returned is stored on the vendor record and used on every subsequent transaction that vendor is involved in.

### 8.3 First Payout Hold

The first payout earned by a newly registered vendor is held for 24 hours before being released. This is a fraud protection measure — it prevents bad actors from setting up fake listings, collecting payments, and immediately cashing out before the platform can detect the problem.

The vendor is notified via SMS when their first payout is held and when it is released. Subsequent payouts settle on Paystack's normal schedule.

### 8.4 Refund Flow

When a vendor cancels a listing after orders have been placed:
1. The vendor sees a warning stating how many paid orders exist and that this cannot be undone
2. On confirmation, every paid order is marked as refunded
3. A Paystack refund is initiated for each order individually
4. Every affected customer receives an SMS with the refund notice and a link to their receipt page where they can track the refund status
5. Refunds typically take 3–5 business days to appear in the customer's account
6. The receipt page shows a live refund status so customers are not left wondering

---

## 9. Cutoff & Auto-Close System

### 9.1 Vendor-Controlled Cutoff

Every meal listing has a cutoff time set by the vendor when creating the listing. The platform does not impose any system-wide cutoff — vendors know their own cooking schedules and set their own deadlines.

The form shows a smart suggestion: *"Most vendors set cutoff 2–3 hours before they start cooking."*

**Validation rules:**
- Cutoff cannot be set in the past
- Cutoff cannot be set after the available date
- If a vendor tries to change the cutoff after orders have already been placed, the system allows it but immediately sends an SMS to every customer who has already paid, informing them of the updated time

### 9.2 How Cutoff Is Enforced

Cutoff enforcement works on two layers that complement each other:

**Layer 1 — The API (hard enforcement):**
Every time a customer attempts to place an order, the server checks whether the current time has passed the meal's cutoff timestamp. If it has, the order is rejected immediately and the meal's status is updated to Closed in the same operation. This means no order can ever slip through after cutoff, regardless of what the customer's screen is showing. The API is the single source of truth.

**Layer 2 — The background job (dashboard cleanup):**
A scheduled job runs every few minutes and finds all meals whose cutoff time has passed but whose status is still Open. It closes them and notifies the vendor. This is what causes the vendor's dashboard to flip automatically into Cooking Mode without requiring an order attempt to trigger it. The background job is a convenience layer — the API is the actual enforcement.

### 9.3 Client-Side Countdown

Each order page shows a live countdown timer that counts down to the cutoff time. The timer changes color as urgency increases — normal colour above one hour, amber below one hour, red and pulsing below 15 minutes. When the countdown reaches zero, the order button disables on the customer's screen without a page reload.

This is a user experience layer only. A determined customer who tampers with their browser clock or ignores a disabled button will still be rejected by the API.

---

## 10. Notification System

### 10.1 SMS via Termii

All v1 notifications are sent via Termii, a Nigerian SMS gateway with reliable local delivery. WhatsApp Business API notifications are planned for v1.1.

All sent notifications are logged in the database with delivery status so disputes can always be investigated with a complete paper trail.

### 10.2 Notification Templates

**Customer — Order Confirmed (Pickup, Cooked Meal with extras)**
```
Your PreChop order is confirmed!

Jollof Rice Friday — 2 plates
Extras: Fish, Plantain
Total paid: ₦5,600
Pickup code: 4821

📍 Block C canteen, beside tuck shop
Show your code to Amaka when you arrive.

Questions? Call: 08012345678
Receipt: prechop.ng/order/[slug]/receipt/[orderId]
```

**Customer — Order Confirmed (Delivery)**
```
Your PreChop order is confirmed!

Jollof Rice Friday — 1 plate + Salad
Total paid: ₦2,500 (incl. ₦200 delivery)

🛵 Delivering to: Room 14, Moremi Hall
Amaka will call when she's on the way.

Questions? Call: 08012345678
Receipt: prechop.ng/order/[slug]/receipt/[orderId]
```

**Customer — Cutoff Time Changed**
```
PreChop Update:

The cutoff time for Jollof Rice Friday has changed.
New cutoff: Thursday 8pm (was 10pm).

Your order is still confirmed. Pickup code: 4821
```

**Customer — Refund Initiated**
```
PreChop Refund Notice:

Your order for Jollof Rice Friday was cancelled by the vendor.
Refund of ₦5,600 is being processed — expect it within 3–5 business days.

Track your refund: prechop.ng/order/[slug]/receipt/[orderId]
Sorry for the inconvenience.
```

**Vendor — New Pickup Order (Cooked Meal)**
```
PreChop: New order!

Chidinma Okafor — 2x Jollof Rice
Extras: Fish, Plantain
Total: ₦5,600  |  Pickup

Running total: 22 orders · ₦55,000
Slots left: 8
```

**Vendor — New Delivery Order**
```
PreChop: Delivery order!

Kemi Adebayo — 2x Jollof Rice + Salad
Total: ₦5,600 + ₦200 delivery
🛵 Deliver to: Sabo Junction
Phone: 08098765432
```

**Vendor — Cutoff Reached**
```
PreChop: Orders closed!

Jollof Rice Friday — ordering is now closed.
Final count: 22 paid orders (18 pickup · 4 delivery)
Total: ₦55,000

Extras needed:
- Fish: 9 portions
- Plantain: 14 portions

View cooking list: prechop.ng/meals/[id]
```

---

## 11. Receipt System

### 11.1 Receipt Page

A permanent, publicly accessible receipt page exists at `/order/[slug]/receipt/[orderId]`. This page is linked from:
- The success page after payment
- The confirmation SMS sent to the customer
- The WhatsApp share message

The receipt shows the complete order breakdown — meal name, vendor, quantity, each extra selected with its price, delivery fee if applicable, total amount paid, fulfillment details, pickup code if applicable, the customer's message to the vendor, Paystack transaction reference, and payment timestamp.

### 11.2 Save as Image

A button on the receipt page allows the customer to save the receipt as an image to their phone's gallery. This uses the browser's canvas rendering to capture the receipt card as a PNG. The saved image contains all order details and is useful when there is no internet access at the point of collection.

### 11.3 WhatsApp Share

A share button generates a pre-formatted WhatsApp message containing the key order details and a link to the receipt page. The customer can send this to the vendor as proof of payment — especially useful if there is any confusion at pickup.

### 11.4 Refund Status on Receipt

If the vendor cancels the listing and a refund is initiated, the receipt page updates to show the refund status clearly — initiated date, expected timeline, and once confirmed, the date the refund was processed. This keeps customers informed without them needing to contact anyone.

---

## 12. Fulfillment & Delivery System

### 12.1 Fulfillment Options

All three meal categories support Pickup, Delivery, or Both. The vendor sets this per listing, not per account. This means the same vendor can offer delivery for their rice on a day they have time to run deliveries, but offer pickup only for their snacks on a busier day.

| Fulfillment | Vendor provides | Customer provides |
|---|---|---|
| Pickup | Collection point (text) | Shows up with pickup code |
| Delivery | Delivery fee + coverage area | Delivery address |
| Both | Both above | Chooses at order time |

### 12.2 Pickup Verification

After cutoff, the vendor's dashboard shows a code entry box. The vendor asks the customer for their code, types it in, and taps confirm. The order is marked as fulfilled, the row turns green, and the running collection counter increments. If the vendor enters an invalid or already-used code, an error message appears immediately.

### 12.3 Delivery Management

Delivery orders appear in a separate tab on the vendor's meal detail page. Each row shows the customer's name, quantity, extras, address, and phone number. The vendor has two status actions:
- **Mark Out for Delivery** — vendor has dispatched the order and is on the way
- **Mark Delivered** — order has been handed over to the customer

The vendor can tap a customer's name to dial them directly from the dashboard without having to copy the number.

### 12.4 Edge Cases

**Vendor sets cutoff in the past:** Blocked by both client-side validation on the form and server-side validation on submission. Clear error message shown.

**Vendor changes cutoff after orders are placed:** Allowed — vendors may need to extend or shorten their window. All existing confirmed customers are immediately notified via SMS of the change.

**Customer outside delivery coverage area:** For v1, the coverage area is displayed as a text description before the customer pays. It is the customer's responsibility to confirm they are within range. The vendor manually decides whether to fulfil edge-case delivery requests. For v2, a map-based radius validation will be added.

**Delivery — vendor cannot reach customer:** Vendor calls the customer directly from the dashboard. If unresolved, the vendor raises a dispute through their dashboard. PreChop admin mediates manually.

---

## 13. API Routes

### Public Routes (No Authentication Required)

These routes are accessible by anyone — they power the customer-facing order pages.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/meals/[slug]` | Fetch meal details, extras, and slot availability for the order page |
| POST | `/api/orders` | Create a new pending order with extras, fulfillment type, and customer message |
| GET | `/api/orders/[id]/status` | Poll order payment status (used by success page while awaiting webhook) |
| GET | `/api/orders/[id]/receipt` | Fetch full receipt data for the receipt page |
| POST | `/api/webhooks/paystack` | Receive and process Paystack payment events |

### Vendor Routes (Authenticated — Vendor Session Required)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/request-otp` | Send OTP to vendor phone number |
| POST | `/api/auth/verify-otp` | Verify OTP and create vendor session |
| POST | `/api/vendors` | Create vendor account on signup |
| GET | `/api/vendors/me` | Get current vendor's profile |
| PATCH | `/api/vendors/me` | Update vendor profile |
| GET | `/api/meals` | List all meals belonging to the vendor |
| POST | `/api/meals` | Create a new meal listing with category, extras, and fulfillment |
| GET | `/api/meals/[id]` | Get meal detail including all orders and extras summary |
| PATCH | `/api/meals/[id]` | Update meal details — if cutoff changes, notify existing customers |
| DELETE | `/api/meals/[id]` | Cancel meal and trigger refunds for all paid orders |
| POST | `/api/meals/[id]/fulfill` | Mark a pickup order as fulfilled using a pickup code |
| PATCH | `/api/orders/[id]/deliver` | Update a delivery order status (out for delivery / delivered) |
| PATCH | `/api/meals/[id]/extras/[extraId]` | Toggle an extra's availability on or off |
| GET | `/api/vendors/me/earnings` | Earnings summary for the vendor |
| POST | `/api/disputes` | Raise a dispute against an order |

### Admin Routes (Authenticated — Staff Access Only)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/admin/vendors` | List all vendors with verification status |
| PATCH | `/api/admin/vendors/[id]` | Verify a vendor or suspend their account |
| GET | `/api/admin/orders` | List all orders across the platform |
| GET | `/api/admin/payouts` | View payout log |
| GET | `/api/admin/disputes` | List all disputes |
| PATCH | `/api/admin/disputes/[id]` | Resolve a dispute with a resolution note |

---

## 14. Edge Cases & Error Handling

### Race Condition — Last Slot

When two customers attempt to order the last available slot at exactly the same moment, the database must guarantee only one succeeds. The system locks the meal record for the duration of the slot check and order creation. The transaction that wins creates the order and increments the slot count. The transaction that loses receives an error and the customer sees a friendly message: *"Sorry, those plates just sold out. Only X remaining."*

### Extras Pricing Lock

When a customer completes an order, the price of each selected extra is copied from the extra record onto the order record at that moment. If the vendor later changes an extra's price, past orders are unaffected. The invoice always reflects what the customer actually agreed to pay.

### Pending Order Slot Hold

When a customer reaches the Paystack checkout, their slot is reserved for 10 minutes. If they do not complete payment within that window, their order is automatically cancelled and the slot is released. A background job handles this cleanup every 10 minutes. This prevents a situation where a popular listing appears sold out to other customers because of abandoned checkouts.

### Duplicate Payment Webhooks

Paystack may occasionally deliver the same payment confirmation event more than once. The system checks whether the associated payment record is already marked as successful before taking any action. If it is, the duplicate event is acknowledged with a 200 response and nothing further happens. This prevents double-fulfillment and duplicate SMS notifications.

### Webhook Delivery Failure

If the PreChop server is temporarily unavailable when Paystack fires a payment confirmation, Paystack will retry the webhook up to 15 times over 24 hours. During this window, the customer's success page shows a message: *"Your payment was received. Your confirmation is on the way."* Once the webhook delivers successfully, the SMS fires as normal. A background check also periodically looks for orders that have been in Pending Payment status for more than 30 minutes and verifies their Paystack transaction status directly — catching any permanently missed webhooks.

### Vendor Cancels After Orders Placed

The vendor sees a clear warning showing the number of paid orders that will be refunded. This action cannot be undone. On confirmation, the meal is cancelled, every paid order is marked for refund, Paystack refund requests are initiated for each, and every affected customer receives an SMS.

### Customer Message Length

The optional message field is capped at 150 characters on both the client (character counter shown) and the server (validation on order creation). This prevents abuse and keeps the vendor's order list readable.

---

## 15. Dispute Resolution

### 15.1 When Disputes Are Raised

Common dispute scenarios:
- Customer paid but vendor claims the order does not exist
- Customer did not show up — vendor wants to close the order
- Delivery was never received — customer wants a refund
- Vendor claims delivery was completed — customer denies it
- Customer says extras were missing from their order

### 15.2 V1 Resolution Process

Either party — vendor or customer — can raise a dispute from within the platform. Vendors raise disputes from their meal detail page. Customers raise disputes from their receipt page.

The dispute is created with the order details, the reason text, and the party who raised it. The PreChop admin is notified and reviews the dispute in the admin panel. The admin has access to the full order record, payment record, notification log, and all timestamps. Based on this, the admin marks the dispute as investigating, works toward a resolution, records the resolution note, and closes the dispute. Both parties are notified via SMS when the dispute is resolved.

### 15.3 Admin Dispute Panel

The admin dispute panel shows three columns — Open, Investigating, and Resolved. Each dispute card shows the order number, the parties involved, the reason, and the time raised. Clicking a dispute shows the full order context. The admin can update the status, add resolution notes, and trigger refunds if warranted.

---

## 16. Pricing Model

### Model: ₦75 flat fee per completed order

PreChop charges ₦75 on every successfully paid order. This is deducted automatically at the payment level — vendors never handle it and customers never see it as a separate line item.

**Why flat fee:**
- Simple to explain to vendors: *"We take ₦75 per order, nothing else"*
- Predictable for both parties
- Scales well at low and mid order values
- Delivery fees go entirely to the vendor — PreChop only charges on the food order itself

### Revenue Projections

| Stage | Vendors | Avg orders/day | Monthly Revenue |
|---|---|---|---|
| 1 campus launch | 20 | 15 | ₦675,000 |
| 3 campuses | 100 | 20 | ₦4,500,000 |
| 10 campuses | 500 | 25 | ₦28,125,000 |
| 50 campuses | 3,000 | 20 | ₦135,000,000 |

### Future Pricing Levers

- **Volume discount:** Vendors completing 200+ orders per month pay ₦50 per order instead of ₦75
- **Premium features:** Custom link slugs, advanced analytics, priority support — ₦5,000/month
- **Campus partnerships:** Institution pays a flat monthly fee covering all their verified vendors

---

## 17. Tech Stack

### Core

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 14 (App Router) | File-based routing, Server Components, API routes in one place |
| Language | TypeScript | Type safety on money, extras, and order logic is essential |
| Styling | Tailwind CSS | Fast, consistent mobile-first UI |
| Database | Supabase (PostgreSQL) | Free tier, built-in Realtime subscriptions, Auth |
| ORM | Prisma | Schema-first, typed queries, clean migrations |
| Payments | Paystack | Nigerian-native, subaccounts, excellent webhook tooling |
| SMS | Termii | Nigerian SMS gateway, reliable local delivery |
| File uploads | Cloudinary | Free tier, auto-resize, CDN |
| Hosting | Vercel | Zero-config deploy, Cron Jobs built in |
| Receipt images | html2canvas or Satori | Client-side receipt card export for save-to-gallery |
| Unique slugs | nanoid | Tiny, URL-safe IDs |

### Dev & Tooling

| Tool | Purpose |
|---|---|
| Prisma Studio | Visual database explorer |
| Supabase Dashboard | Auth management, Realtime monitor |
| Paystack Dashboard | Transaction log, webhook event monitor |
| Vercel Analytics | Page-level traffic data |
| GitHub Actions | CI pipeline — lint and type-check on every push |

---

## 18. MVP Build Timeline

### Week 1 — Core loop

- [ ] Database schema (all tables including extras and customer message field)
- [ ] Vendor signup with phone OTP verification
- [ ] Paystack subaccount creation on signup
- [ ] Meal creation form — 3-tab category selector
- [ ] Extras section for Cooked Meals (up to 6 items)
- [ ] Fulfillment selector (all categories support pickup + delivery)
- [ ] Slug generation + public order page
- [ ] Extras display and live total calculation on order page
- [ ] Fulfillment toggle on order page with dynamic total
- [ ] Customer message field (optional, 150 char)
- [ ] Paystack inline checkout with full total including extras and delivery
- [ ] Webhook handler — order confirmed, payment logged
- [ ] SMS to customer on payment (with receipt link)
- [ ] SMS to vendor on new order (with extras summary)

### Week 2 — Vendor dashboard + session

- [ ] Phone OTP login
- [ ] Vendor dashboard with live meal cards
- [ ] Realtime order count via Supabase Realtime
- [ ] Meal detail page — tabbed by fulfillment type
- [ ] Orders table showing extras per customer and customer message
- [ ] Extras availability toggle (mark unavailable mid-day)
- [ ] Cutoff enforcement on API
- [ ] Countdown timer component with urgency colours
- [ ] Background job — close expired meals every 5 minutes
- [ ] Cutoff change → notify existing customers via SMS
- [ ] Pickup code verification UI (cooking mode)
- [ ] Delivery status management (out for delivery / delivered)
- [ ] Extras summary block in cooking mode

### Week 3 — Receipt + edge cases

- [ ] Receipt page at `/order/[slug]/receipt/[orderId]`
- [ ] Extras breakdown on receipt
- [ ] Customer message shown on receipt
- [ ] Save receipt as image
- [ ] WhatsApp share button with pre-formatted message including extras
- [ ] Refund status on receipt page
- [ ] Race condition protection (row locking on slot check)
- [ ] Extras price locked at order time
- [ ] Pending order cleanup cron (10 minutes)
- [ ] Duplicate webhook idempotency guard
- [ ] Vendor cancellation + bulk refunds
- [ ] Customer SMS updated with refund status link

### Week 4 — Admin + polish + launch

- [ ] Minimal admin panel (vendor list, order list, payout log, disputes)
- [ ] Dispute raise flow for vendors and customers
- [ ] First payout 24hr hold logic
- [ ] Landing page with clear vendor CTA
- [ ] Mobile audit on real Android devices (cheap ones)
- [ ] All copy reviewed — Naija-friendly throughout
- [ ] Domain prechop.ng + SSL
- [ ] Manual onboarding of first 5–10 vendors on one campus
- [ ] Monitor live orders — fix everything that breaks in real time
- [ ] No new features this week — stability only

---

## 19. Scale Roadmap

### v1.1 — Trust & Retention (Month 2–3)

- WhatsApp Business API notifications (replace SMS)
- Customer ratings after collection — thumbs up or down
- Returning customer name pre-fill by phone number
- Vendor profile page: `prechop.ng/v/amaka-obi`
- Delivery map radius validation

### v1.2 — Discovery (Month 3–4)

- Campus feed: `prechop.ng/campus/unilag` — all active meals filterable by category
- Vendor follow — customer saves vendor number and gets SMS on new listing
- Vendor analytics dashboard — best-selling meals, peak order times, extras popularity

### v2.0 — Beyond Campus (Month 6+)

- Estate and neighbourhood vendors
- Church and event pre-orders — one-time high-quantity listings
- Group orders with split payment
- Recurring weekly listing auto-renewal

### v3.0 — Platform (Year 2)

- PreChop for restaurants — table pre-orders
- Explore page — `prechop.ng/explore`
- Supplier integration for bulk ingredient sourcing
- Pan-Africa expansion — Ghana, Kenya, with local payment rails

---

## 20. Campus Launch Playbook

Technology is ready. Distribution is the hardest part. Here is the step-by-step approach for the first campus launch.

### Choosing the First Campus

Do not pick the biggest campus. Pick the campus where you have a personal contact — someone already on ground who can walk up to vendors on your behalf. Good options: UNILAG, UI, LASU, OAU. One campus. One month. All focus.

### One Week Before Launch

1. Identify 5–10 active WhatsApp Status food vendors manually — scroll through your contacts, ask people you know on campus
2. DM or meet them in person — show them PreChop on your phone, not a slide deck
3. Walk through creating their first listing together, side by side
4. Offer zero platform fees for the first month — they keep the full ₦75 per order that would normally go to PreChop
5. Make sure they have your WhatsApp number and can reach you instantly

### Launch Week

1. Each vendor posts their PreChop link on WhatsApp Status as normal — no change to their existing behaviour
2. Monitor orders in real time from the admin dashboard
3. Fix anything that breaks immediately — same day, not next sprint
4. Be reachable by phone for vendors and for customers who have questions
5. Collect feedback after every vendor's first set of orders — what confused people, what felt wrong, what they loved

### After 10 Vendors

1. Document one vendor's result clearly — how many orders they received, how much they earned, what changed for them
2. Use that story as the pitch for the next 10 vendors — let the result speak
3. Move to a second campus only after the first is self-sustaining and vendors are recruiting each other through word of mouth

---

## 21. Environment Variables

```bash
# Database
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# Paystack
PAYSTACK_SECRET_KEY="sk_live_..."
NEXT_PUBLIC_PAYSTACK_KEY="pk_live_..."
PAYSTACK_WEBHOOK_SECRET="whsec_..."

# Termii SMS
TERMII_API_KEY="TL..."

# Cloudinary
CLOUDINARY_CLOUD_NAME="prechop"
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."

# Cron Security
CRON_SECRET="..."

# App
NEXT_PUBLIC_APP_URL="https://prechop.ng"
NODE_ENV="production"
```

---

*PreChop Product Specification · Campus Food Pre-Order Platform*
*Built for Nigerian campuses · Designed to scale across Africa*
*v2.0 · June 2026*
