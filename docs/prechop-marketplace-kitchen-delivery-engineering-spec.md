# PreChop — Marketplace, Kitchen, Scheduling & Delivery System

## 1. Purpose

Implement the new PreChop marketplace/kitchen, scheduling, breakfast-planning, vendor delivery-code, customer receipt-confirmation, feature-toggle, and Brand Kit activation functionality.

**This is an enhancement of the existing PreChop project, NOT a rebuild.**

Before changing anything:

1. Inspect the complete existing project structure.
2. Read the existing architecture, models, routes, APIs/server actions, components, dashboards, authentication/authorization, payment logic, vendor registration/onboarding, order flow, and documentation.
3. Identify what already exists and reuse it.
4. Do not duplicate existing functionality.
5. Preserve all working behavior unless this specification explicitly changes it.
6. Make the smallest safe changes necessary.
7. Run existing tests/type checks/lint/build before and after implementation.

---

# 2. Existing Vendor Registration — DO NOT REBUILD

PreChop already has vendor registration.

The engineer must inspect and reuse the existing:

- Vendor model
- Vendor registration
- Vendor approval/status
- Vendor authentication/authorization
- Vendor dashboard
- Payment infrastructure
- Order infrastructure
- Marketplace functionality

Only add what is missing.

Do NOT create a second vendor-registration/onboarding system.

---

# 3. Core Product Model

PreChop is a food marketplace, not only a breakfast application and not only one kitchen.

Customers discover independent kitchens/vendors.

Initial marketplace categories:

- Breakfast
- Lunch
- Dinner

The architecture must support additional categories later.

The owner's own kitchen must use the exact same kitchen/vendor architecture as every other vendor. Do not create special code paths for it.

---

# 4. Every Kitchen Uses the Same Feature System

Every vendor kitchen should have access to the common PreChop capabilities where applicable:

- Menu management
- Food categories
- Opening/availability settings
- Kitchen timetable
- Schedule Ahead
- Weekly Breakfast Plan
- Delivery
- Pickup
- Delivery coverage
- Vendor delivery codes
- Orders
- Reviews
- Earnings
- Notifications
- Future kitchen features

Vendors can individually enable/disable optional features for their kitchen.

---

# 5. Two-Level Feature Control

## 5.1 Super Admin — Platform Control

Super Admin must have master feature controls.

Examples:

```text
Marketplace               TRUE/FALSE
Breakfast                 TRUE/FALSE
Lunch                     TRUE/FALSE
Dinner                    TRUE/FALSE
Schedule Ahead            TRUE/FALSE
Weekly Breakfast Plan     TRUE/FALSE
Delivery                  TRUE/FALSE
Pickup                    TRUE/FALSE
Vendor Registration       TRUE/FALSE
```

Use the existing admin architecture if available.

## 5.2 Vendor — Kitchen Control

When a feature is globally active, the vendor can decide whether to use it.

Example:

```text
Schedule Ahead            ON
Weekly Breakfast Plan     OFF
Delivery                  ON
Pickup                    ON
```

If Super Admin disables a feature globally, vendors cannot use it even if their own setting says ON.

**Super Admin = master availability.**

**Vendor = individual kitchen usage.**

Use this pattern for future optional features as well.

---

# 6. Vendor Public Kitchen

Every vendor gets a public kitchen/storefront.

Example:

```text
/ k / chidis-kitchen
```

Use the project's existing routing convention if one already exists.

A kitchen should expose relevant existing/new information such as:

- Kitchen name
- Logo
- Cover image
- Description
- Menu
- Food categories
- Prices
- Availability
- Kitchen location
- Opening/operating schedule
- Planned weekly menu/timetable
- Schedule Ahead availability
- Delivery/pickup information
- Reviews

Do not duplicate an existing storefront.

---

# 7. Kitchen Timetable

Vendors can configure a timetable from the vendor dashboard.

Timetable may contain:

- Day
- Order start time
- Cutoff time
- Cooking/preparation start
- Ready/delivery start
- Planned menu
- Other scheduling data already supported by the existing system

Example:

| Batch | Order Window | Cooking | Ready/Delivery |
|---|---|---|---|
| 1 | 6:00–7:00 | 7:00 | 8:30 |
| 2 | 7:00–8:30 | 8:30 | 9:30 |
| 3 | 8:30–9:30 | 9:30 | 11:00 |

These are examples only. Times are vendor-configurable.

---

# 8. Timetable Menu Must Be Visible to Customers

This is mandatory.

If a vendor sets a menu against days in their timetable, customers viewing that kitchen must be able to see it.

Example:

```text
Chidi's Kitchen — Weekly Menu

Monday
Fried Rice & Chicken

Tuesday
Yam & Beans

Wednesday
Jollof Rice & Chicken

Thursday
Beans & Plantain

Friday
Fried Rice & Fish
```

The customer-facing timetable must use the vendor's actual saved configuration.

Do NOT hardcode these foods.

If the vendor changes Tuesday's planned menu, the public kitchen timetable must reflect the change.

This should integrate with Schedule Ahead and Weekly Breakfast Plan where applicable.

---

# 9. Schedule Ahead

Schedule Ahead allows customers to order for a future date/time according to the vendor's configured timetable and availability.

Vendor controls:

- Whether Schedule Ahead is enabled
- Available dates/times
- Cutoff times
- Preparation/cooking windows
- Relevant menu availability

Super Admin controls whether Schedule Ahead exists on the platform.

Reuse existing scheduling/order logic where possible. Do not create a parallel scheduling engine unnecessarily.

---

# 10. Weekly Breakfast Plan

Weekly Breakfast Plan is an optional vendor feature.

When globally enabled and enabled by a vendor, customers can use the vendor's configured weekly breakfast menu/timetable to plan future breakfast orders.

Respect:

- Vendor timetable
- Planned menu
- Availability
- Cutoff times
- Existing order rules

Reuse shared scheduling logic.

---

# 11. Delivery — PreChop Is NOT the Delivery Company

For this version, PreChop does NOT operate physical delivery.

Do NOT build:

- Rider registration
- Rider accounts
- Rider dashboard
- Rider assignment
- PreChop rider tracking
- PreChop delivery fleet
- Automatic rider dispatch

The vendor is responsible for getting food to the buyer.

The vendor may:

1. Deliver personally.
2. Use a local bike rider they know.
3. Use another delivery arrangement of their choice.

PreChop provides the ordering and delivery-identification infrastructure only.

---

# 12. Delivery Coverage — Keep It Simple

For v1, do NOT implement:

- Radius delivery
- Map drawing
- Geofencing
- Complex GPS delivery calculations

A vendor should be able to choose:

## Option A — Anywhere within Zaria

```text
Delivery Coverage:
[✓] Anywhere within Zaria
```

If selected, they do not need to select every location.

## Option B — Specific delivery locations

Vendor can enter locations as text.

Example:

```text
Samaru
Aviation
ABU Main Campus
Palladan
Kwangila
```

Do not force vendors to select from a hardcoded list of Zaria zones.

The architecture must allow additional locations/cities later.

---

# 13. Kitchen Location vs Delivery Coverage

These are separate.

### Kitchen Location

Where the kitchen physically operates.

Example:

```text
Kitchen Location:
Samaru
```

### Delivery Coverage

Where the vendor is willing to deliver.

Example:

```text
Kitchen Location:
Samaru

Delivery Coverage:
Anywhere within Zaria
```

A vendor's kitchen location must NOT automatically restrict its delivery coverage.

---

# 14. Customer Delivery Location

GPS must NOT be mandatory.

Customers can manually enter their delivery location.

Example:

```text
ABU Main Campus, Samaru
```

Optionally provide:

```text
Use my current location
```

if appropriate.

GPS is a convenience, not a requirement.

Do not build a sophisticated location-intelligence system for v1.

---

# 15. Delivery Code — FINAL RULE

Remove all zone/location letters from delivery codes.

Do NOT use:

```text
CHI-S-001
CHI-A-001
CHI-SM-001
```

Use:

```text
VENDOR_ID + SEQUENTIAL_NUMBER
```

Example:

```text
CHI1001
CHI1002
CHI1003
```

Where:

- `CHI` = permanent Vendor ID
- `1001` = sequential package/delivery number

---

# 16. Permanent Vendor ID

Each vendor gets a unique short permanent Vendor ID.

Examples:

```text
Chidi's Kitchen     CHI
Mama's Kitchen      MAM
PreChop Breakfast   PCB
```

If the existing vendor ID is suitable, reuse it where possible. Otherwise introduce a stable short public Vendor ID.

Vendor IDs must be unique and must not change simply because a vendor changes their public kitchen name.

---

# 17. Delivery Sequence Starts at 1001

Each vendor's sequence begins at:

```text
1001
```

Example:

```text
CHI1001
CHI1002
CHI1003
...
CHI10100
CHI10101
CHI10102
...
```

Another vendor:

```text
MAM1001
MAM1002
...
```

Owner's kitchen:

```text
PCB1001
PCB1002
...
```

Codes must be generated sequentially by the backend.

They must NOT be random.

---

# 18. Delivery Codes Are Never Reused

This is strict.

Once a delivery code is assigned/consumed, it can NEVER be reused.

Even if the order is:

- Cancelled
- Refunded
- Returned
- Failed
- Completed
- Archived

the code remains permanently consumed.

Do NOT search for old unused codes.

Use an atomic/sequential allocation mechanism that prevents duplicate codes during concurrent orders.

The database must enforce uniqueness.

---

# 19. Pre-Printed Vendor Stickers

PreChop will produce an initial physical sticker batch for each vendor.

Example:

```text
CHI1001 – CHI10100
```

The system sequence begins at 1001 and continues upward.

After the initial printed batch:

```text
CHI10101
CHI10102
...
```

continue automatically.

Never reset or reuse the sequence.

---

# 20. Delivery Sticker Content

The physical sticker should contain:

- Vendor branding/name
- Delivery code
- QR code
- Thank-you message
- PreChop branding

Example:

```text
CHIDI'S KITCHEN

CHI1007

DELIVERY CODE

[ QR CODE ]

Scan to visit Chidi's Kitchen

THANK YOU!

Powered by PreChop
```

Final visual design can be handled separately.

---

# 21. Sticker QR Code

The QR code should point to the vendor's permanent public kitchen URL.

Example:

```text
prechop.com.ng/k/chidis-kitchen
```

It should NOT point to an individual order.

The QR identifies the kitchen; the delivery code identifies the specific package/order.

---

# 22. Order Delivery Status

Because PreChop has no rider system, keep statuses simple and reuse existing order statuses where possible.

Compatible vendor-controlled states include:

- New Order
- Accepted
- Preparing
- Ready
- Sent for Delivery

The vendor can mark:

> Sent for Delivery

because they have arranged delivery themselves or handed the package to their chosen local rider.

Do not create a rider workflow.

---

# 23. Buyer Controls Final Receipt

The vendor must NOT be able to finalize an order as "Customer Received."

Vendor can mark:

> Sent for Delivery

Buyer is the final authority for physical receipt.

Buyer sees:

> **I've Received My Order**

Once confirmed:

```text
Order = DELIVERED / COMPLETED
```

Use the existing equivalent status if the current system already has one.

---

# 24. Buyer Receipt Confirmation Security

The buyer receipt action must be authenticated and tied to the actual buyer/order.

Do not expose an unauthenticated endpoint that allows anyone to mark an order received.

Vendor must not be able to call the buyer confirmation action on behalf of the buyer.

---

# 25. No Complex Delivery Dispute System Yet

If the buyer does not confirm receipt, do not build a large logistics/dispute system now.

Vendor can mark:

```text
Sent for Delivery
```

Buyer can later confirm receipt.

If there is no confirmation, keep the order in the appropriate pending state until a future operational rule is added.

---

# 26. Vendor Brand Kit

Vendor must pay for the PreChop Brand Kit before they can start creating/receiving orders.

Brand Kit includes:

- Personalized delivery-code stickers
- Branded nylon
- Shrink-wrap
- Fragile tape

Suggested explanation shown before payment:

> **Why do I need the PreChop Brand Kit?**
>
> Your Brand Kit provides the essential branded packaging and delivery materials needed to present your kitchen professionally, protect food during delivery, and help customers easily identify their orders. It keeps your own kitchen brand visible while providing a consistent PreChop experience.

Do NOT promise a fixed physical fulfillment date at this stage.

---

# 27. Vendor Activation After Brand-Kit Payment

Existing vendor registration/approval remains intact.

The selling capability should follow:

```text
Vendor Registration
        ↓
Vendor Approval
        ↓
Brand Kit Payment Required
        ↓
Payment Confirmed
        ↓
Vendor Selling Activated
        ↓
Can create/receive orders
```

A vendor can be registered/approved but remain unable to create or receive orders until Brand Kit payment succeeds.

Reuse existing payment infrastructure.

Do not rebuild payment processing.

---

# 28. Brand-Kit Payment Must Be Server-Side

The vendor must not be able to bypass the requirement by changing frontend state.

Use/reuse a durable server-side payment state, for example:

```text
PENDING
PAID
FAILED
```

Adapt to the existing payment schema if appropriate.

Order creation and order receipt must check the vendor's actual activation state server-side.

---

# 29. Existing Project Cleanup

After implementation, inspect the existing project for files/folders/components/services/routes/models that have become obsolete.

### Remove obsolete code when:

- It is definitely unused.
- It has been replaced.
- It creates duplicate/conflicting behavior.
- It is dead code directly related to the old implementation.

Before deleting:

1. Search all imports/references.
2. Check dynamic imports.
3. Check API/server-action references.
4. Check tests.
5. Check configuration references.
6. Confirm it is genuinely unused.
7. Then remove it.

### Preserve useful future functionality

If existing functionality may still be useful later:

- Remove it from active execution if necessary.
- Prefer clean deprecation over leaving duplicate active code.
- Document/comment future-use logic only when genuinely useful.
- Do not leave two competing implementations active.

Do not delete working functionality merely because it is not currently visible in the UI.

---

# 30. No Breaking Changes

Preserve all existing working systems unless explicitly changed here.

This includes:

- Authentication
- Vendor registration
- Vendor approval
- Buyer flows
- Marketplace
- Menu system
- Payment
- Orders
- Reviews
- Earnings
- Notifications
- Admin
- Existing APIs
- Existing database relationships

When a new requirement overlaps existing functionality:

**extend/refactor/reuse the existing implementation rather than creating a parallel implementation.**

---

# 31. Architecture Rules

Business rules should not live only inside UI components.

Server-side rules are required for:

- Delivery-code generation
- Feature availability
- Brand Kit activation
- Order creation eligibility
- Buyer receipt confirmation
- Vendor delivery coverage validation

Use database uniqueness constraints where appropriate.

Use atomic/transaction-safe allocation for delivery codes.

Reuse existing architecture, services, repositories, server actions, and validation patterns when available.

---

# 32. Suggested Domain Relationships

Adapt to existing schema rather than blindly creating duplicate models.

Conceptually:

```text
Vendor
 ├── Vendor ID
 ├── Kitchen Profile
 ├── Kitchen Location
 ├── Delivery Coverage
 ├── Feature Settings
 ├── Timetable
 ├── Menu
 ├── Brand Kit Status
 └── Delivery Code Sequence

Order
 ├── Buyer
 ├── Vendor
 ├── Menu Items
 ├── Delivery Address
 ├── Delivery Code
 ├── Order Status
 └── Buyer Receipt Confirmation
```

---

# 33. Customer Kitchen Experience

Customer-facing kitchen page should show:

- Kitchen identity
- Current menu
- Menu categories
- Prices
- Availability
- Weekly/timetable menu when configured
- Schedule Ahead when available
- Weekly Breakfast Plan when available
- Delivery/pickup information
- Reviews if already supported

Example:

```text
CHIDI'S KITCHEN

Today's Menu
- Fried Rice & Chicken
- Jollof Rice & Chicken

Weekly Menu

MONDAY
Fried Rice & Chicken

TUESDAY
Yam & Beans

WEDNESDAY
Jollof Rice & Chicken

[ Schedule Ahead ]
```

Only show optional sections when the platform and vendor settings allow them.

---

# 34. Marketplace Experience

Initial marketplace categories:

```text
Breakfast
Lunch
Dinner
```

Vendors can operate in one or more categories according to their menus/configuration.

Do not force every vendor into only one category.

---

# 35. Implementation Sequence

## Phase 1 — Audit Existing System

Inspect and document:

- Existing vendor registration
- Vendor dashboard
- Marketplace
- Kitchen/storefront
- Menu system
- Timetable/scheduling
- Orders
- Payments
- Delivery-related fields/statuses
- Admin
- Feature settings
- Database
- APIs/server actions
- Tests
- Documentation

Identify reuse vs missing functionality.

## Phase 2 — Feature Controls

Implement/reuse:

- Super Admin platform feature toggles
- Vendor feature settings
- Central feature checks

## Phase 3 — Timetable & Planned Menu

Implement:

- Vendor timetable
- Planned menu by day
- Customer-visible weekly timetable/menu
- Schedule Ahead integration
- Weekly Breakfast Plan

## Phase 4 — Delivery Coverage

Implement:

- Anywhere within Zaria
- Specific text delivery locations

No radius/maps/geofencing.

## Phase 5 — Delivery Codes

Implement:

- Permanent Vendor ID
- Start at 1001
- Sequential allocation
- Never reuse
- Atomic allocation
- Database uniqueness
- Sticker batch compatibility

## Phase 6 — Buyer Receipt

Implement:

- Vendor "Sent for Delivery"
- Buyer "I've Received My Order"
- Authenticated server-side confirmation
- Final delivered/completed state

## Phase 7 — Brand Kit Payment

Extend existing vendor onboarding/payment:

- Brand Kit payment required
- Existing payment infrastructure reused
- Successful payment activates selling
- Pending/failed payment keeps selling locked

## Phase 8 — Cleanup

Remove obsolete duplicate/dead code safely.

## Phase 9 — Verification

Run the project's existing:

- Tests
- Type checks
- Lint/format
- Build
- Database/migration checks
- Relevant integration tests

Do not finish with known failing checks.

---

# 36. Acceptance Criteria

## Vendor

- Existing registration still works.
- Existing approval still works.
- Vendor can configure kitchen features.
- Vendor can configure timetable.
- Vendor can assign planned menus to timetable days.
- Planned menus are visible to customers.
- Vendor can configure delivery coverage.
- Vendor can select "Anywhere within Zaria."
- Vendor can specify custom text locations.
- Vendor cannot use globally disabled features.
- Vendor cannot create/receive orders before Brand Kit payment.
- Vendor can mark Sent for Delivery.
- Vendor cannot mark buyer receipt.

## Customer

- Can view vendor kitchens.
- Can view current menus.
- Can view vendor's configured weekly/timetable menu.
- Can schedule ahead where enabled.
- Can use Weekly Breakfast Plan where enabled.
- Can provide delivery location without GPS.
- Can optionally use GPS.
- Can see delivery/order code.
- Can confirm receipt.
- Cannot confirm another buyer's order.

## Super Admin

- Can activate/deactivate Schedule Ahead.
- Can activate/deactivate Weekly Breakfast Plan.
- Can activate/deactivate Delivery.
- Can activate/deactivate Pickup.
- Can activate/deactivate Breakfast/Lunch/Dinner/Marketplace where supported.
- Can control other future platform feature flags.
- Can manage existing vendor approval/status.
- Can monitor Brand Kit activation/payment state.

## Delivery Code

- Unique Vendor ID exists.
- Sequence starts at 1001.
- Codes increase sequentially.
- No random code generation.
- Codes are generated server-side.
- Codes are never reused.
- Concurrent orders cannot receive duplicate codes.
- Cancelled/refunded/completed orders do not release codes.
- No zone prefix exists.

## Delivery

- No rider account.
- No rider dashboard.
- No PreChop rider assignment.
- No PreChop logistics fleet.
- Vendor handles physical delivery.
- Vendor may use local riders or deliver personally.

## Cleanup

- Obsolete duplicate implementations removed.
- Unused replaced files/folders removed where safe.
- Useful future functionality preserved appropriately.
- No conflicting duplicate active systems remain.

---

# 37. Engineering Guardrails

1. **Do not break working functionality.**
2. **Do not rebuild vendor registration.**
3. **Do not duplicate existing components/services/models.**
4. **Inspect before modifying.**
5. **Reuse existing payment/order infrastructure.**
6. **Do not introduce unnecessary third-party services.**
7. **Do not introduce maps/radius/geofencing for delivery v1.**
8. **Do not build a rider system.**
9. **Do not require hardcoded delivery zones for vendor coverage.**
10. **Do not randomly generate delivery codes.**
11. **Never reuse a consumed delivery code.**
12. **Do not allow vendors to finalize buyer receipt.**
13. **Do not rely on frontend-only security/feature checks.**
14. **Do not delete existing functionality without verifying references and usage.**
15. **Keep the implementation modular and extensible.**
16. **Run tests/build/type checks after changes.**
17. **Document meaningful database migrations.**
18. **If existing implementation conflicts with this specification, inspect its purpose before replacing it.**
19. **Prefer the smallest necessary change.**
20. **Do not refactor unrelated working code merely for style.**

---

# 38. Final Product Principle

**PreChop provides the infrastructure; vendors operate their own kitchens.**

```text
PRECHOP
│
├── Marketplace
├── Ordering
├── Payments
├── Kitchen Platform
├── Scheduling
├── Feature Controls
├── Vendor IDs
├── Delivery Codes
├── Brand Kit
└── Customer Receipt Confirmation
        │
        ├── Vendor controls food/menu
        ├── Vendor controls availability
        ├── Vendor controls delivery coverage
        ├── Vendor arranges physical delivery
        └── Buyer confirms actual receipt
```

Build the system so future PreChop logistics, additional cities, more delivery options, more meal periods, and additional kitchen features can be added without rewriting the core architecture.
