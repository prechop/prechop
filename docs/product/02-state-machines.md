# 02 — State Machines

Two independent lifecycles: the **DailyOrder** (a vendor's listing) and the **BuyerOrder** (a
buyer's order against it), plus the **Payment** sub-lifecycle.

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
