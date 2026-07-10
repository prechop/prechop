# Vendors as buyers — order from others, never self

**Date:** 2026-07-10
**Status:** Approved, implementing

## Problem

A logged-in seller (vendor) cannot use the buyer-side marketplace. The only
thing stopping them is a permission gap: vendor accounts are provisioned into
the `Vendors` group, whose `VendorBaseAccess` policy does not include
`buyer:order:*`, so `assertBuyer` (which probes `buyer:order:read`) returns 403.

We want sellers to browse the marketplace and place orders from **other**
vendors — but never from their own listings. There is currently **no**
"can't order your own listing" invariant anywhere in the codebase.

## Ground truth (as-is)

- Identity is 1:1: a user links to one `vendorProfile` (`vendorProfiles.userId`
  is unique). There is no separate buyer account — every logged-in user is a
  potential buyer identified by `auth.userId`.
- `placeOrder` takes `buyerId` from the session and derives `vendorId` from the
  listing (`dailyOrder.vendorId`, a `vendorProfiles` id). It never compares
  them. They are different key types: `buyerId` → `users`, `vendorId` →
  `vendorProfiles`.
- `resolvePermissions(userId)` unions statements from the user's groups'
  policies ∪ direct policies; `buyer:order:*` lives only in `BuyerBaseAccess`
  (the `Buyers` group).
- Nav is chosen per page by a `shellRole` prop on `AppShell`, falling back to
  `user.groups.includes("Vendors")`. A vendor visiting `/marketplace` already
  renders the buyer nav for that page.
- The marketplace API (`/api/daily-orders/marketplace`) and public listing API
  (`/api/daily-orders/public/[shareableToken]`) are unauthenticated.

## Decisions

1. **Grant model — buying is a universal capability.** Every active user is a
   buyer by default; "vendor" is purely additive.
2. **Navigation — Selling/Buying mode switcher** in the header, visible only to
   vendors, swapping the whole nav set.
3. **Own listings — hidden entirely.** A vendor's own listings never appear in
   their marketplace grid (server + client), and their own order page is blocked
   (server + client).
4. **Self-order guard is a server-side domain invariant**, the authoritative
   protection across all entry points.

## Design

### 1. Permission model — buying becomes universal

Add `BASE_AUTHENTICATED_STATEMENTS` (Allow `buyer:order:create`,
`buyer:order:read`, `buyer:review:create`) to the permissions catalog and have
`resolvePermissions` **always** union it in for any active user, independent of
groups. `assertBuyer` then passes for every active account, vendors included.

- Zero migration, no group churn.
- The existing `Buyers` group stays (redundant but harmless — avoids touching
  existing buyers).
- Suspended/inactive users are rejected upstream in `resolveScope` before
  permissions are consulted, so this does not widen access to disabled accounts.

### 2. Self-order guard (authoritative, server)

In `placeOrder`, after loading the daily order and **before** reserving slots or
initializing payment: resolve the listing `vendorId` → owning `userId`, compare
to `buyerId` (both normalized to strings). If equal, throw
`ErrCannotOrderOwnListing` (403). Fails fast, no side effects. Modeled invariant,
not an incidental permission gap.

### 3. Marketplace grid — own listings never shown

Make `/api/daily-orders/marketplace` optionally auth-aware: if a session is
present and the caller owns a vendor profile, pass that `vendorProfileId` as an
`excludeVendorId` filter into `getMarketplace`, dropping their own listings
server-side. `MarketplaceWrapper` filters defensively client-side as a backstop.

### 4. Listing/order page — own listing blocked both sides

The public listing API gains the same optional auth and returns
`isOwnListing: true` when the caller owns the listing. `OrderDetailWrapper`
renders a "This is your listing" state (no cart/checkout) when the flag is set.
The §2 guard is the server backstop regardless of the client.

### 5. Selling / Buying mode switcher

A header control in `AppShell`, rendered only when
`user.groups.includes("Vendors")`. It reflects the current area (Selling on
vendor pages, Buying on buyer pages); toggling routes to that area's home
(`/dashboard` vs `/marketplace`). Nav swaps naturally because each page declares
its `shellRole`; no separate persisted mode state to desync. Buyer nav in Buying
mode gains **My orders**.

No edge-proxy change: `/marketplace` stays public-browsable; `/my-orders`,
`/account`, checkout are already auth-protected.

### 6. Testing

- **Server unit:** vendor ordering own listing → `ErrCannotOrderOwnListing`;
  vendor ordering another vendor's listing → succeeds; marketplace excludes the
  caller's own listing; resolver grants `buyer:order:*` to a vendor account.
- **e2e:** vendor logs in → switches to Buying → own listing absent from grid →
  orders another vendor's listing → own `/o/[token]` shows the blocked state.

## Non-goals / kept as-is

- The `Buyers` group is kept (redundant, zero-risk) rather than retired.
- Vendor *purchases* (`/my-orders`) and vendor *sales* (`/pipeline`) stay on
  separate screens; not merged.
