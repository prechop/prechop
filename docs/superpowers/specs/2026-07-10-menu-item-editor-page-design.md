# Menu add/edit as its own page

**Date:** 2026-07-10
**Status:** Approved

## Problem

The vendor menu UI (`src/libs/MenuWrapper`) renders the item list **and** an
inline bottom-sheet modal for adding/editing an item in a single 824-line
component. Editing a dish happens in a cramped overlay. We want add/edit to be
its own full page, matching the pattern the daily-order composer already uses
(`/dashboard/new` + `/dashboard/[orderId]/edit`).

## Design

### Routes (mirror the daily-order composer convention)

- `/menu` — list only (modal removed)
- `/menu/new` — item form in create mode
- `/menu/[itemId]/edit` — item form in edit mode

Each page wraps the form in `AppShell shellRole="VENDOR"` + `VendorStatusGate`,
identical to the daily-order pages.

### New component `src/libs/MenuItemEditor/`

Takes an optional `itemId` prop (`isEdit = !!itemId`). Holds the fields from the
old modal — name, category, price, prep time, description, option-group chips
(with the "Manage" → `OptionGroupsManager` hook) — **plus** the item image.

- **Hydration (edit):** find the item in the already-SWR-cached `/menu` list
  (the list page primes that cache; no new API endpoint needed). Show
  `PageLoader` while the list loads.
- **Image, two-phase because presign needs an item id** (`POST
  /menu/[itemId]/image/presign`):
  - The editor lets the user pick a file and shows a local preview
    (`URL.createObjectURL`).
  - **Save (create):** `POST /menu` (append `displayOrder = items.length`) →
    get the new id → if a file is staged, presign → PUT to storage → `confirm`
    → `router.push("/menu")`.
  - **Save (edit):** `PATCH /menu/[itemId]` → if a new file is staged,
    presign/PUT/confirm with the existing id → back to `/menu`.
  - Image now saves atomically with the rest of the form (a small improvement
    over today's fire-on-pick behavior).
- Header with a back link to `/menu`; primary button labelled
  "Add item" / "Save changes".

### `MenuWrapper` (list) changes

Delete `draft` state, the `Overlay`/`Sheet`/`Handle` styles, `save()`,
`openCreate`, `openEdit`, and the modal block. "＋ Add item" / "Add your first
item" become links to `/menu/new`; the row **Edit** action and the thumbnail
navigate to `/menu/[itemId]/edit`. The thumbnail is no longer an upload control
(inline upload moves into the editor, per the chosen scope).

Kept on the list, unchanged: Hide/Show, Mark sold out, Delete, reorder arrows,
the header "🧩 Option groups" manager, and the stat cards.

### Backend

No changes. Reuses `POST /menu`, `PATCH /menu/[itemId]`,
`/menu/[itemId]/image/{presign,confirm}`, `/menu/option-groups`.

## Testing

- Types + lint + production build clean.
- Full unit suite stays green (logic is unchanged; this is a UI move).
- Playwright: drive `/menu` → `/menu/new` (create with image) → item appears in
  list → `/menu/[itemId]/edit` (update, persists) against the real server + DB.
