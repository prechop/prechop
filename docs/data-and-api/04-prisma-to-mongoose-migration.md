# 04 — Prisma → Mongoose Migration Map

This is the field-level translation from the old `prechop-api` Prisma schema (PostgreSQL) to the
new Mongoose collections (MongoDB). Use it when porting each model.

## Global translation rules

| Prisma | Mongoose |
|---|---|
| `id String @id @default(cuid())` | `_id: ObjectId` (auto); expose `id` via aggregation `$toString` |
| `@relation(fields:[xId], references:[id])` | `xId: { type: ObjectId, ref: "collection" }` |
| `enum X { A B }` | `type: String, enum: ["A","B"]` |
| `Int` money field | keep `Number` (integer kobo) |
| `String[]` | `[String]` |
| `Json?` | `Schema.Types.Mixed` |
| `DateTime @default(now())` / `@updatedAt` | `{ timestamps: true }` |
| `@unique` | `index({ field: 1 }, { unique: true })` |
| `@@index([a,b])` | `schema.index({ a: 1, b: 1 })` |
| `@@map("snake_case")` | `mongoose.model(name, schema, "collectionName")` |
| soft delete `deletedAt DateTime?` | `deleted: Boolean` + `pre("aggregate")` filter |
| `onDelete: Cascade` | app-level cascade in the service, or a `pre("remove")` hook |

Reads go through **aggregation pipelines** so the shared `pre("aggregate")` hooks apply
(inject `deleted:false`, `id`, project out internals, resolve S3 keys → signed URLs). Writes use
`findOneAndUpdate`/`save`. Every `*DB` function is wrapped in the
`database_request_duration_seconds` timer and returns `null`/`[]` on error rather than throwing.

## Model-by-model

### Campus → `campuses`
`shortCode @unique` → unique index. No relations stored on the doc (children reference it).

### School → `schools`
`name @unique`. `type` stays a free string.

### User → `users`
- `phone @unique` → unique index **on the encrypted value** (deterministic encryption or a
  separate `phoneHash` for lookup — see note). `isPhoneVerified`, `isActive`, `lastLoginAt` as-is.
- Relations (`buyerOrders`, `reviews`, …) are **not** stored on the user; children reference `userId`.
- **Lookup-by-phone note:** since `phone` is encrypted with AES-256-GCM (non-deterministic IV),
  add a `phoneHash` (SHA-256 of normalized phone) unique index for lookups; store the encrypted
  value for display/decryption. This preserves both uniqueness and confidentiality.

### RefreshToken → `refreshTokens`
Direct 1:1 port. `tokenHash @unique`. Cascade-on-user-delete becomes an app-level delete in the
account-deactivation service. (Optional alternative: embed a capped array on the user doc — the
separate collection is chosen to keep reuse-detection queries simple.)

### VendorProfile → `vendorProfiles`
`userId @unique`, `email @unique` → unique indexes. `categories MenuCategory[]` → `[String]` enum.
`accountNumber` → encrypted. Counters (`rating`, `totalReviews`, `totalOrders`, `completionRate`,
`profileCompleteness`) as-is.

### MenuItem → `menuItems`
`price` → `priceKobo` (rename for clarity; still integer kobo). `deletedAt` → `deleted:Boolean`.
Keep `vendorId` + `campusId` indexes.

### TimetableEntry → `timetableEntries`
`@@unique([vendorId, menuItemId, dayOfWeek])` → compound unique index.

### DailyOrder → `dailyOrders` (+ embedded items)
- Scalars port directly. `shareableToken @unique` → unique index.
- **`DailyOrderItem` and `DailyOrderItemAddon` become embedded subdocuments** on the daily-order
  (they were separate tables joined by FK, but are always read with the parent and share its
  snapshot lifecycle). The `@@unique([dailyOrderId, menuItemId])` becomes an application-level
  guard when adding items (or an array-level check), since Mongo can't enforce uniqueness across
  embedded array elements natively.
- `orderedQuantity` stays on each embedded item and is incremented atomically with
  `$inc` on `items.$[elem].orderedQuantity` using `arrayFilters`.

### BuyerOrder → `buyerOrders` (+ embedded items)
- Scalars port directly. `orderNumber @unique` → unique index. `platformFeeKobo` default now
  sourced from `siteConfigs` (5000) rather than a hard schema default — see ADR-004.
- **`BuyerOrderItem` / `BuyerOrderItemAddon` embedded** on the order (same reasoning).
- `payment` and `review` are **references** (`Payment.buyerOrderId`, `Review.buyerOrderId` unique),
  not embedded — different lifecycles.

### Payment → `payments`
`buyerOrderId @unique`, `paystackRef @unique`, `idempotencyKey @unique` → unique indexes.
`webhookVerified` boolean idempotency flag preserved.

### Refund → `refunds`
`paymentId @unique`. Direct port.

### Review → `reviews`
`buyerOrderId @unique`. `tags String[]` → `[String]`. `isFlagged` preserved.

### Notification → `notifications`
`data Json?` → `Mixed`. `@@index([userId, isRead])` → compound index. `type` free string
(enumerated in `notification.types` on the app side).

### AuditLog → `auditLogs`
Append-only: no update/delete `*DB` functions are written for this collection. `previousState`/
`newState` → `Mixed`. Indexes on `userId` and `(resourceType, resourceId)`.

### AnalyticsSnapshot → `analyticsSnapshots`
`@@unique([vendorId, date])` → compound unique index (upsert key). `topItemIds String[]` → `[String]`.

### WhatsappTv → `whatsappTvs`
`whatsappNumber` → **encrypted** (Phase-2-ready), validated `^234[789]\d{9}$` with `+` stripped
before encrypt. Never hard-deleted (soft `isActive:false`). Add the missing `@@map` intent — the
old Prisma model had **no** `@@map` (physical table was `WhatsappTv`); the Mongo collection is
normalized to `whatsappTvs`.

## Things that do NOT port

| Old | Reason |
|---|---|
| Prisma middleware for campus scoping | replaced by explicit `campusId` in each `*DB` query |
| `SELECT FOR UPDATE` row locks | Mongo uses the existing Redis slot locks + transactions instead |
| BullMQ job tables/queues | deleted; cron replaces them |
| pg connection pool config | replaced by Mongoose `maxPoolSize` |

## Data migration (if any existing Postgres data)

If `prechop-api` has live Postgres data to carry over, write a one-off script in `scripts/`:
1. Read each Postgres table via a temporary `pg` client.
2. Transform per the mapping above (cuid→ObjectId map table, fold item tables into embedded arrays,
   encrypt PII, hash phones for `phoneHash`).
3. Bulk-insert into Mongo, preserving relations via the ObjectId map.
4. Verify counts + spot-check a few orders end to end.

If launching greenfield (no production data yet), skip this — just seed via `scripts/seed.ts`.
