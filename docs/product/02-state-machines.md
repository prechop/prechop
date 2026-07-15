# 02 — State Machines

Three independent lifecycles: the **VendorProfile** (onboarding → go-live), the **DailyOrder** (a
vendor's listing) and the **BuyerOrder** (a buyer's order against it), plus the **Payment**
sub-lifecycle.

## Vendor profile lifecycle

```
                    ┌──────────────────┐
                    │    INCOMPLETE    │◄──── registration
                    └────────┬─────────┘
                             │  vendor: POST /api/vendors/me/submit
                             │  (gated on the ONBOARDING CHECKLIST — not on
                             │   profileCompleteness; see below)
                             ▼
   ┌────────────────►┌──────────────────┐
   │                 │  PENDING_REVIEW  │  profile is read-only
   │                 └────┬────────┬────┘
   │  vendor resubmits    │        │
   │                      │        │  admin: /onboarding/{id}/reject { reason }
   │                      │        ▼
   │              ┌───────┘   ┌──────────────────────┐
   │              │           │  CHANGES_REQUESTED   │
   │              │           └──────────┬───────────┘
   │              │                      │
   └──────────────┼──────────────────────┘
                  │  admin: /onboarding/{id}/approve
                  ▼
           ┌──────────────┐   admin suspend    ┌─────────────┐
           │    ACTIVE    │───────────────────►│  SUSPENDED  │
           │ marketplace- │◄───────────────────│ (login also │
           │   visible    │   admin reactivate │  blocked)   │
           └──────────────┘                    └─────────────┘
```

- **`ACTIVE` is reached only by admin approval.** There is no auto-activation.
  *(Corrected 2026-07-15 — the PRD's "auto-ACTIVE at `profileCompleteness = 100`" was never how the
  code behaves and has been reversed. See BR-15/BR-16.)*
- **Submission gates on the onboarding checklist**, not the completeness score: phone verified,
  `businessName`, ≥1 category, `locationType`, `paystackSubaccountCode`, `profileImageUrl`.
  **Why:** the score awards 25% for menu items and 15% for a timetable entry, both of which sit
  behind the active-vendor gate — an applicant cannot add them before approval, so gating on 100%
  **deadlocked every applicant at ~60%**. Do not change this back.
- Submit is allowed **only** from `INCOMPLETE` / `CHANGES_REQUESTED` (else `ALREADY_SUBMITTED`).
- `isOpenForOrders` can only be switched on while `ACTIVE` (BR-17); only `ACTIVE` vendors can publish
  daily orders (BR-18).
- `profileCompleteness` is recomputed on submit for **display/audit only** — it gates nothing.

## Daily Order lifecycle

```
        create                publish (isPublic)
  ┌────────────┐   ┌──────────────────────────┐
  │            ▼   │                          ▼
  │        ┌───────┴──┐   publish      ┌──────────┐
  └───────►│  DRAFT   │───────────────►│  ACTIVE  │
           └──────────┘                └────┬─────┘
                                            │
                     ┌──────────────────────┼───────────────────────┐
                     │ cutoff reached        │ vendor closes early    │ vendor cancels
                     │ (cron sweep)          │ PATCH /close           │ PATCH /cancel
                     ▼                       ▼                        ▼
                ┌──────────┐            ┌──────────┐            ┌────────────┐
                │  CLOSED  │            │  CLOSED  │            │ CANCELLED  │
                └──────────┘            └──────────┘            └────────────┘
                                                                (bulk-refund paid orders)
```

- `DRAFT` → editable, not visible, no orders.
- `ACTIVE` → visible on marketplace/link, accepts orders until `cutoffTime`.
- `CLOSED` → no new orders; existing orders proceed through their own FSM.
- `CANCELLED` → terminal; all paid buyer orders are refunded.
- **CLOSED/CANCELLED are terminal** — the listing can't be edited.

## Buyer Order lifecycle (8 states)

```
                        webhook charge.success
  ┌─────────────────┐   (amount + HMAC verified)   ┌────────┐
  │ PENDING_PAYMENT │ ───────────────────────────► │  PAID  │
  └────────┬────────┘                              └───┬────┘
           │ 15-min abandoned sweep                    │ vendor confirms
           │ OR buyer/system pre-pay cancel            ▼
           ▼                                       ┌───────────┐
      ┌──────────┐                                 │ CONFIRMED │
      │ CANCELLED│◄───────┐                        └────┬──────┘
      └──────────┘        │ buyer/vendor/system         │ vendor starts cooking
                          │ cancel (PAID|CONFIRMED)     ▼
                          │  → auto-refund         ┌───────────┐
      ┌──────────┐        │                        │ PREPARING │
      │ REFUNDED │◄───────┘                        └────┬──────┘
      └──────────┘                                      │ food done (buyer SMS)
                                                        ▼
                                                   ┌────────┐
                                                   │ READY  │
                                                   └───┬────┘
                                                       │ collected / delivered
                                                       ▼
                                                  ┌───────────┐
                                                  │ COMPLETED │  → receipt, totals++, review prompt (24h)
                                                  └───────────┘
```

### Transition rules

| From | To | Trigger | Guard |
|---|---|---|---|
| `PENDING_PAYMENT` | `PAID` | Paystack webhook `charge.success` | HMAC + amount + idempotency |
| `PENDING_PAYMENT` | `CANCELLED` | abandoned sweep (>15 min) or buyer cancel | payment still `INITIALIZED` |
| `PAID` | `CONFIRMED` | vendor | ownership |
| `CONFIRMED` | `PREPARING` | vendor | ownership |
| `PREPARING` | `READY` | vendor | ownership |
| `READY` | `COMPLETED` | vendor | ownership |
| `PAID`\|`CONFIRMED` | `CANCELLED` | buyer, vendor (reason), or system (cutoff) | → triggers refund |
| `CANCELLED` (from paid) | `REFUNDED` | refund processed | Paystack refund success |

**Hard rule:** no cancellation or refund from `PREPARING` onward. Any illegal transition throws
`INVALID_ORDER_STATE`.

### Terminal states
`COMPLETED`, `CANCELLED`, `REFUNDED`.

### On `COMPLETED` (side effects)
1. Generate receipt (`@react-pdf/renderer` → private S3 → presigned URL on `receiptUrl`).
2. `vendorProfile.totalOrders++`; recompute completion rate.
3. Enqueue-equivalent: schedule a review prompt (24h later — surfaced by the notification/cron path).
4. Append `auditLog`.

## Payment sub-lifecycle

```
INITIALIZED ──charge.success (verified)──► SUCCESS ──refund──► REFUNDED
     │                                        
     ├──charge.failed──► FAILED               
     └──15-min no webhook──► ABANDONED (sweep) 
```

`webhookVerified` guards idempotency; a duplicate webhook returns 200 and no-ops.

## Cross-lifecycle interactions

- Publishing a daily order makes its buyer orders *possible*; the daily order's cutoff drives the
  system-cancel of any `PAID`-but-unconfirmed buyer orders at cutoff (cron sweep).
- Cancelling a daily order cascades a **bulk refund** to all its paid buyer orders (each refunded
  individually and moved to `REFUNDED`).
- A buyer order can only be reviewed once it is `COMPLETED`, within the 72h window.
