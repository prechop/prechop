# Prechop "Jollof" Rebrand — Design Spec

**Date:** 2026-07-08
**Scope:** Full visual rebrand of every route in the Prechop Next.js app (buyer, vendor, admin), plus the shared design system. No data/API/logic changes.

## Goal

Replace the current warm-orange design language with **Jollof** — an Afro-modern, appetizing, food-forward identity — applied route-by-route across all 23 routes, with matching light ("Cream") and dark ("Charcoal") themes. Then validate end-to-end with the full-stack-validation skill and push.

## Constraints / Guardrails

- **styled-components only** — no Tailwind, no new CSS framework.
- Keep the existing `--pc-*` CSS-variable names so downstream code keeps working; change values, add new tokens.
- **No changes to data wiring, SWR hooks, props, API, or business logic** — markup/composition/styling only.
- Preserve every module's public export shape (route files keep importing the same wrappers).
- Design both light and dark themes.
- Keep `tsc`, `biome`, `next build`, `vitest`, and Playwright green.

## 1. Tokens (`src/styles/global.ts`)

Jollof palette:

| Token | Light | Dark |
|---|---|---|
| `--pc-color-primary` | `#FF5A1F` pepper orange | same |
| `--pc-color-primary-600` | `#E5480F` | same |
| `--pc-color-primary-50` | `#FFF0E6` | `#2A1810` |
| `--pc-color-accent` | `#1F9D57` palm green | `#2FBE6C` |
| `--pc-color-gold` (new) | `#F4B400` plantain | same |
| `--pc-color-danger` | `#E5484D` | same |
| `--pc-bg` | `#FFF6EC` cream | `#14100C` |
| `--pc-surface` | `#FFFFFF` | `#1E1813` |
| `--pc-surface-2` | `#FBEFE2` | `#2A2119` |
| `--pc-border` | `#F0E2D2` | `#382D22` |
| `--pc-text` | `#1A1410` | `#FBF3E9` |
| `--pc-text-muted` | `#7A6E62` | `#B6A491` |

New tokens: `--pc-gradient-hero` (`135deg,#FF5A1F→#F4B400`), `--pc-gradient-warm`, elevation scale (`--pc-shadow-sm/-/-lg`, `--pc-shadow-primary`), rounder radii (10/16/24/pill), motion (`--pc-ease`, `--pc-dur`), and `--pc-font-display`.

## 2. Typography

Add via `next/font/google`: **Bricolage Grotesque** (display headings, `--pc-font-display-loaded`) + **Plus Jakarta Sans** (body, `--pc-font-sans-loaded`), replacing DM Sans.

## 3. Shared components (`src/components`)

Upgrade `Button` (gradient primary, `gold` variant, pill option, press motion), `Input/Select/Textarea`, `Text/Heading/Title/Badge`, `Box/Card/Container/Grid/Row/Stack`, `Loader`. Add `StatCard`, `SectionHeader`, `EmptyState`, `Avatar`, `Skeleton`, `PageHeader`. Subtle entrance/interaction motion via `motion` (already a dep).

Redesign shells: `AppShell` (buyer/vendor top bar + bottom nav), `AdminShell` (sidebar).

## 4. Routes (all 23)

Marketing/auth: `/`, `/login`. Buyer: `/marketplace`, `/menu`, `/my-orders`(+`[orderId]`), `/order/confirmation`, `/o/[shareableToken]`, `/account`, `/timetable`. Vendor: `/dashboard`(+`/new`), `/pipeline`, `/earnings`. Admin: `/admin` + `/campuses` `/orders` `/reviews` `/schools` `/settings` `/vendors` `/whatsapp-tvs`.

## 5. Validation

Run `/full-stack-validation`: seed DB → start app → Playwright every route → keep test/build green → security/design review → fix → commit & push to `origin/main`.
