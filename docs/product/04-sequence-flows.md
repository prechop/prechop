# 04 — Sequence Flows

The key end-to-end flows as sequence diagrams. Actors: **Buyer**, **Vendor**, **App** (Next.js
route → service → model), **Redis**, **Paystack**, **Mongo**, **Cron**.

## 1. Place order → pay → cook → complete (the happy path)

```mermaid
sequenceDiagram
    participant B as Buyer
    participant App
    participant Redis
    participant PS as Paystack
    participant M as Mongo
    participant V as Vendor

    B->>App: POST /api/orders {dailyOrderId, items[], addonIds[], fulfillment}
    App->>App: validate daily order ACTIVE & within window (BR-6, BR-10)
    App->>App: resolve items + fetch addon prices server-side (BR-2)
    App->>Redis: SET NX slot:lock:{item}:{order} TTL 10m (BR-12)
    alt slot unavailable
        Redis-->>App: lock fails
        App-->>B: 409 SLOT_UNAVAILABLE
    else slots held
        App->>App: compute subtotal + delivery + platform fee (BR-4)
        App->>PS: initialize transaction (split, idempotencyKey) BEFORE db write
        PS-->>App: authorization_url + access_code
        App->>M: txn: create buyerOrder(PENDING_PAYMENT)+items+payment(INITIALIZED) (BR-30)
        App-->>B: paymentUrl
        B->>PS: pay on Paystack hosted page
        PS-->>App: POST /api/webhook/paystack charge.success
        App->>App: verify HMAC-SHA512 + amount + idempotency (BR-28,29)
        App->>M: txn: order→PAID, payment→SUCCESS(webhookVerified)
        App->>M: $inc orderedQuantity + totalOrdersCount
        App->>Redis: release slot locks
        App-->>V: notify (web-push + SMS) new paid order
        V->>App: PATCH status PAID→CONFIRMED→PREPARING→READY→COMPLETED
        App->>App: on COMPLETED → generate receipt (react-pdf → S3), totals++, review prompt
    end
```

## 2. Cutoff enforcement (cron reconciler)

```mermaid
sequenceDiagram
    participant Cron
    participant App
    participant Redis
    participant M as Mongo
    participant PS as Paystack
    participant V as Vendor

    Cron->>App: cutoffSweep tick (every 1 min)
    App->>Redis: SET NX cutoff:lock:{dailyOrderId} EX 300 (single-instance guard)
    App->>M: find ACTIVE dailyOrders where cutoffTime <= now
    loop each expired daily order
        App->>M: dailyOrder → CLOSED
        App->>M: find PAID-but-unconfirmed buyer orders
        loop each
            App->>PS: refund
            App->>M: order → CANCELLED → REFUNDED
        end
        App-->>V: SMS final count
    end
```

Because the API already blocks late orders synchronously (BR-6), a ≤1-minute sweep lag is
harmless — no buyer can slip in after cutoff.

## 3. Abandoned-order sweep

```mermaid
sequenceDiagram
    participant Cron
    participant App
    participant M as Mongo
    participant Redis

    Cron->>App: abandonedSweep tick (every 5 min)
    App->>M: find PENDING_PAYMENT older than 15m with payment INITIALIZED
    loop each
        App->>M: order → CANCELLED (cancelledBy: system)
        App->>Redis: DEL slot:lock:*:{orderId}
    end
```

## 4. Vendor onboarding → auto-activation

```mermaid
sequenceDiagram
    participant V as Vendor
    participant App
    participant PS as Paystack

    V->>App: register/vendor (campusId) → OTP → verify
    V->>App: POST business-identity  (→ recompute completeness)
    V->>App: POST location (ON/OFF campus)
    V->>App: POST categories
    V->>App: POST profile-image/presign → upload to S3 → confirm
    V->>App: POST menu items (≥3)  + timetable (≥1 day)
    V->>App: POST bank-details
    App->>PS: resolveAccountNumber + createSubaccount
    PS-->>App: subaccount code + verified accountName
    App->>App: completeness = 100 → status INCOMPLETE→ACTIVE (BR-16)
    V->>App: PATCH open-status (now allowed) → visible on marketplace
```

## 5. Buyer/vendor cancellation with refund

```mermaid
sequenceDiagram
    participant Actor as Buyer or Vendor
    participant App
    participant PS as Paystack
    participant M as Mongo
    participant Other as Counterparty

    Actor->>App: cancel order
    App->>App: assert status in {PAID, CONFIRMED} (BR-31)
    App->>PS: refund(amountKobo incl. delivery fee)
    alt refund ok
        PS-->>App: refund id
        App->>M: order→CANCELLED→REFUNDED, refund record
        App-->>Other: SMS + email refund info
    else refund fails
        App->>M: log failure (surfaced for manual review, not swallowed)
        App-->>Actor: error (retryable)
    end
```

## 6. Daily-order cancellation (bulk refund)

```mermaid
sequenceDiagram
    participant V as Vendor
    participant App
    participant M as Mongo
    participant PS as Paystack

    V->>App: PATCH /api/daily-orders/:id/cancel
    App->>M: dailyOrder → CANCELLED
    App->>M: find all PAID/CONFIRMED buyer orders on it
    loop each
        App->>PS: refund
        App->>M: order → CANCELLED → REFUNDED
        App-->>V: (buyer) SMS refund info
    end
```

## 7. Review submission

```mermaid
sequenceDiagram
    participant B as Buyer
    participant App
    participant M as Mongo
    participant V as Vendor

    Note over App: 24h after COMPLETED, buyer gets a review prompt
    B->>App: POST /api/reviews {buyerOrderId, rating, tags, comment?}
    App->>App: assert order COMPLETED, no existing review, within 72h (BR-33,34)
    App->>M: create review; recompute vendor rating/totalReviews
    App-->>V: notify new review (rating hidden until ≥5 — BR-36)
```

## 8. Notification fan-out (fire-and-forget)

```mermaid
sequenceDiagram
    participant App as Request handler
    participant Notif as notification.service
    participant M as Mongo
    participant SC as Sendchamp
    participant RS as Resend
    participant WP as web-push

    App->>Notif: void notify(userId, type, payload)   %% not awaited
    Notif->>M: persist notification
    par best-effort channels
        Notif->>SC: SMS (if applicable)
        Notif->>RS: email (if applicable)
        Notif->>WP: push to subscriptions (prune 404/410)
    end
    Note over App,Notif: a channel failure never breaks the originating request (BR-42)
```
