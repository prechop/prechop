# 02 — C4 Diagrams

Diagrams use the [C4 model](https://c4model.com) levels: Context → Container → Component.
All are ASCII/Mermaid so they render in any viewer and stay in version control.

---

## Level 1 — System Context

```mermaid
graph TD
    Buyer[Buyer<br/>student / staff / community]
    Vendor[Vendor<br/>cook / stall / restaurant / bakery]
    Admin[Super Admin<br/>platform owner]

    Prechop[["Prechop<br/>campus food pre-order platform<br/>(Next.js single app)"]]

    Paystack[Paystack<br/>payments + split settlement]
    Sendchamp[Sendchamp<br/>SMS / OTP]
    Resend[Resend<br/>email]
    S3[AWS S3<br/>images + receipts]
    Push[Web Push<br/>VAPID]

    Buyer -->|browse, order, pay, review| Prechop
    Vendor -->|onboard, publish orders, cook| Prechop
    Admin -->|manage campuses, vendors, moderation| Prechop

    Prechop -->|init tx, verify webhook, refund| Paystack
    Prechop -->|OTP + order SMS| Sendchamp
    Prechop -->|receipts, welcome, refunds| Resend
    Prechop -->|presigned upload/read| S3
    Prechop -->|order/cutoff notifications| Push
    Paystack -.->|charge.success webhook| Prechop
```

---

## Level 2 — Container

```mermaid
graph TD
    subgraph Client
      PWA[Buyer PWA<br/>RSC + SWR + styled-components]
      VDash[Vendor Dashboard]
      ADash[Admin UI]
    end

    subgraph "Next.js App (single deployable, Node runtime)"
      Proxy[proxy.ts<br/>edge auth gate — jose]
      Routes[app/api/**<br/>route handlers]
      Wrappers[withApiHandler ∘ withAuth]
      Services[server/services/*<br/>business logic]
      Models[server/models/*DB<br/>Mongoose]
      Cron[cron<br/>in-process scheduler]
      Boot[instrumentation.ts → bootstrap]
    end

    Mongo[(MongoDB)]
    Redis[(Redis)]

    PWA --> Proxy --> Routes
    VDash --> Routes
    ADash --> Routes
    Routes --> Wrappers --> Services --> Models --> Mongo
    Services --> Redis
    Wrappers --> Redis
    Boot --> Cron
    Cron --> Services
    Boot --> Mongo
```

Note there is **one** application container. The dashed "worker" box that existed in
`prechop-api` is deleted; its responsibilities live inside `Cron` and in fire-and-forget calls
from `Services`.

---

## Level 3 — Component: the Buyer-Order / Payment slice

This is the transactional heart of the system.

```mermaid
graph TD
    Route["/api/orders route.ts"]
    OrderSvc[buyerOrder.service<br/>placeOrder / cancel / webhook]
    Locks[Redis slot locks<br/>SET NX slot:lock:{item}:{order}]
    Paystack[paystack.provider<br/>init / verify / refund]
    OrderModel[buyerOrders *DB]
    DailyModel[dailyOrders *DB]
    PayModel[payments *DB]
    Notify[notification.service<br/>void notify]
    Audit[audit.service<br/>void recordAuditEvent]

    Route --> OrderSvc
    OrderSvc -->|check + hold slots| Locks
    OrderSvc -->|init tx BEFORE db write| Paystack
    OrderSvc -->|one transaction: order+items+payment| OrderModel
    OrderSvc --> DailyModel
    OrderSvc --> PayModel
    OrderSvc -.->|on webhook charge.success| Notify
    OrderSvc -.-> Audit
```

Key rules encoded here (see `product/03-business-rules.md`):
- Slots are **checked and held** in Redis (`SET NX`, 10-min TTL) *before* the DB write.
- Paystack init happens **before** the DB write; on failure the acquired locks are released.
- The order + items + addons + payment are persisted in **one transaction**.
- Locks are **not** released after a successful init — they persist until the webhook confirms payment or the 10-min TTL expires.

---

## Level 3 — Component: Background work (cron)

```mermaid
graph LR
    Cron[cron scheduler] --> A[cutoffSweep<br/>*/1 min]
    Cron --> B[cutoffWarning<br/>*/1 min]
    Cron --> C[abandonedSweep<br/>*/5 min]
    Cron --> D[analyticsAggregate<br/>00:01 daily]
    Cron --> E[receiptBackstop<br/>*/10 min]

    A -->|Redis cutoff:lock| DailyOrders
    A -->|auto-refund| Paystack
    C -->|release slot locks| Redis
    D --> AnalyticsSnapshots
    E --> S3
```

Every mutating cron job takes a Redis lock so that, under horizontal scaling, only one instance
performs the work per tick.

---

## Deployment view

```mermaid
graph TD
    LB[Load Balancer / CDN<br/>HTTPS, DDoS buffer]
    App1[Next.js container #1]
    App2[Next.js container #2]
    MongoRS[(MongoDB replica set)]
    RedisI[(Redis)]

    LB --> App1
    LB --> App2
    App1 --> MongoRS
    App2 --> MongoRS
    App1 --> RedisI
    App2 --> RedisI
```

See `architecture/05-deployment-infrastructure.md` for the concrete build and hosting targets.
