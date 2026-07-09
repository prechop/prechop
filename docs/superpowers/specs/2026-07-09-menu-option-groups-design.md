# Menu Option Groups — Design Spec

**Date:** 2026-07-09
**Feature:** Extend the vendor Menu with reusable **option groups** (optional items) that buyers select when placing an order.

## Problem

A vendor's persistent Menu (`MenuItem`) has no concept of optional add-ons. The
daily-order snapshot and buyer-order models already carry a *flat* `addons`
array, but the listing composer never sends any, so add-ons are never created
and buyers never see them. We want vendors to define **reusable, grouped**
optional items once on their menu, attach them to menu items, have them flow
automatically into each daily listing (editable per listing), and let buyers
select them at checkout with proper validation.

## Decisions (from brainstorming)

1. **Grouped options**, not flat extras.
2. **Reusable shared groups**: a vendor-owned library of option groups, attached
   to menu items by reference.
3. **Group rules:** `required` (bool) + `minSelect` + `maxSelect`.
4. **Any menu item category** may have groups (the old MEALS-only restriction is
   dropped).
5. **Auto-attach, editable:** a listing item's option groups are auto-snapshotted
   from the menu item's attached groups; the vendor may tweak them per listing
   before publishing.

## Data model

### New collection: `optionGroups` (vendor-owned library)

```
{
  _id,
  vendorId: ObjectId(ref vendorProfiles)   // indexed
  campusId: ObjectId(ref campuses)
  name: String                              // e.g. "Protein"
  required: Boolean            (default false)
  minSelect: Number            (default 0, >= 0)
  maxSelect: Number | null     (default null = unlimited)
  options: [{ _id, name: String, priceKobo: Number>=0, displayOrder: Number }]
  displayOrder: Number         (default 0)
  deleted: Boolean             (select:false)
  timestamps
}
```

**Creation invariants** (enforced in the service):
- `options.length >= 1`
- if `required` then `minSelect >= 1`
- `minSelect <= options.length`
- if `maxSelect != null` then `maxSelect >= 1` and `maxSelect >= minSelect`

### `MenuItem` gains

```
optionGroupIds: [ObjectId(ref optionGroups)]   // ordered, default []
```

### `DailyOrderItem` snapshot — replace flat `addons` with grouped `optionGroups`

```
optionGroups: [{
  _id,
  sourceGroupId: ObjectId | null,   // provenance (library group id)
  name, required, minSelect, maxSelect,
  options: [{ _id, name, priceKobo, displayOrder }]
}]
```

The snapshot is frozen at listing-creation time (prices/names captured), so
later edits to the library never change an open listing.

### `BuyerOrderItem` — rename flat `addons` to `selectedOptions`

```
selectedOptions: [{
  dailyOrderOptionId: ObjectId | null,   // the snapshot option id chosen
  groupName: String,
  snapshotName: String,
  snapshotPriceKobo: Number,
  quantity: Number,
  subtotalKobo: Number,
}]
```

This is a clean rename (pre-production); all readers are updated.

## Flow

### Vendor: manage the library
New endpoints under `/api/menu/option-groups`:
- `GET  /api/menu/option-groups` — list the vendor's groups
- `POST /api/menu/option-groups` — create
- `PATCH /api/menu/option-groups/[groupId]` — update
- `DELETE /api/menu/option-groups/[groupId]` — soft-delete

Gated by `assertActiveVendor` (same as existing menu routes).

### Vendor: attach groups to menu items
`createMenuItemSchema` / `updateMenuItemSchema` gain `optionGroupIds?: string[]`.
The menu list (`GET /menu`) returns `optionGroupIds` on each item, and the
`MenuWrapper` sheet gains a multi-select of the vendor's option groups plus a
lightweight editor to create/edit groups.

### Vendor: compose a listing (auto-attach, editable)
`DailyOrderComposerWrapper` loads `/menu` (items with `optionGroupIds`) and
`/menu/option-groups` (the library). When an item is selected, its groups are
seeded as **editable copies**. The composer sends, per selected item,
`optionGroups: [{ name, required, minSelect, maxSelect, options:[{name, priceNaira}] }]`.

`buildSnapshotItems`:
- if the item input includes `optionGroups`, snapshot those (edited copies);
- else auto-resolve from the menu item's `optionGroupIds` via the library.

The old MEALS-only guard is removed.

### Buyer: select at checkout
`OrderDetailWrapper` renders each item's `optionGroups`:
- `maxSelect === 1` → radio buttons; when the group is optional a "None" choice
  is shown so the buyer can opt out.
- otherwise → checkboxes; unchecked boxes disable once `maxSelect` is reached.
- required groups whose `minSelect` is unmet block checkout with an inline hint.

Line subtotal = `(basePrice + Σ selected option prices) × quantity`.

### Server-authoritative validation (`placeOrder`)
Input item shape: `{ dailyOrderItemId, quantity, selectedOptionIds?: string[] }`.
For each item, group the selected option ids by their snapshot group and enforce:
- every selected id exists in the item's groups;
- `count >= minSelect` (and `>= 1` when `required`);
- `maxSelect == null || count <= maxSelect`.
Totals are always recomputed on the server from the snapshot.

## Components / files

**Model:** `models/optionGroups/{index,types}.ts` (new); edits to
`models/menuItems`, `models/dailyOrders`, `models/buyerOrders`, `models/index.ts`.

**Validators:** `validators/menu/optionGroups.ts` (new); edits to
`validators/menu/validate.ts`, `validators/dailyOrders/validate.ts`,
`validators/buyerOrders/validate.ts`.

**Services:** `services/menu/optionGroups.ts` (new) + export; edits to
`services/menu/{createMenu,updateMenu,listMenu}.ts`,
`services/dailyOrders/{snapshot,fromTemplate}.ts`,
`services/buyerOrders/placeOrder.ts`.

**API routes:** `app/api/menu/option-groups/route.ts` and
`app/api/menu/option-groups/[groupId]/route.ts` (new); edits to menu item routes
already pass through the extended schemas.

**Client types:** `types/index.ts` — add `MenuOptionGroup`, `MenuOption`,
`DailyOrderOptionGroup`; update `MenuItem`, `DailyOrderItem`, `BuyerOrderItem`.

**UI:** `libs/MenuWrapper` (attach + manage groups), `libs/OptionGroupsManager`
(new, small library editor), `libs/DailyOrderComposerWrapper` (seed + edit per
listing), `libs/OrderDetailWrapper` (buyer selection), `libs/OrderStatusWrapper`
(display `selectedOptions`).

## Testing

- **Model:** `optionGroups` CRUD + soft delete; menu item `optionGroupIds` round-trip.
- **Service:** option-group create invariants; `buildSnapshotItems` auto-resolve
  vs. explicit; `placeOrder` validation (required unmet, min/max bounds, unknown
  id, correct totals with selected options).
- **Validators:** option-group schema edge cases.
- **E2E (Playwright):** vendor creates a group → attaches to item → composes a
  listing → buyer selects options and the total reflects them.

## Out of scope (YAGNI)

- Per-option availability/sold-out toggles.
- Nested / conditional groups.
- Quantity-per-option (an option is selected 0/1× per line; line quantity
  multiplies it).
