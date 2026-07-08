# 04 — Folder Structure

The project mirrors managerenta's layout exactly. The single most important rule is the hard
**client (`src/`) vs server (`src/server/`) split**, enforced by `server-only`.

```
prechop/                              # the merged Next.js app (was prechop/prechop)
├─ instrumentation.ts                 # register() → bootstrap() (node runtime only)
├─ proxy.ts                           # Next 16 edge middleware (page-shell auth gate, jose)
├─ next.config.ts                     # styledComponents, serverExternalPackages, headers
├─ biome.json  tsconfig.json  vitest.config.ts  playwright.config.ts
├─ Dockerfile  buildspec.yml  amplify.yml
├─ public/                            # sw.js, manifest.webmanifest, icons, static
├─ scripts/                           # seed.ts and one-off ops scripts
├─ docs/                              # THIS documentation set
│
└─ src/
   ├─ app/                            # ROUTES — App Router
   │  ├─ layout.tsx                   # reads cookies() once, provider nesting
   │  ├─ (public)/                    # landing, /o/[shareableToken], receipt pages
   │  ├─ (buyer)/                     # marketplace, vendor profiles, checkout, my-orders
   │  ├─ (vendor)/                    # dashboard, pipeline, menu, timetable, earnings
   │  ├─ (admin)/                     # campuses, vendors, orders, reviews, whatsapp-tvs
   │  └─ api/                         # route.ts handlers (thin) — see api-reference
   │
   ├─ components/                     # reusable primitives (client)
   │  ├─ Button/ Text/ Box/ Input/ Select/ Image/ Loader/ Charts/
   │  ├─ BodyWrapper/                 # client provider tree (SWR, contexts, Main shell)
   │  ├─ StyledComponentsRegistry/    # SSR style flushing
   │  ├─ PwaRegistrar/  PushToggle/   # PWA + web-push UI
   │  └─ index.ts                     # barrel
   │
   ├─ hooks/                          # CLIENT data hooks (SWR) + React Contexts, by domain
   │  ├─ Context/                     # AppContext, ThemeContext
   │  ├─ Auth/ Vendor/ Menu/ Timetable/ DailyOrder/ Order/ Review/
   │  ├─ Notification/ Analytics/ Admin/ usePush/ useToast/
   │  └─ index.ts
   │
   ├─ libs/                           # FEATURE UI — one *Wrapper folder per page/feature
   │  ├─ MarketplaceWrapper/ CheckoutWrapper/ MyOrdersWrapper/
   │  ├─ VendorDashboardWrapper/ CookingModeWrapper/ MenuBuilderWrapper/
   │  ├─ TimetableWrapper/ DailyOrderComposerWrapper/ BoostWrapper/
   │  ├─ AdminVendorsWrapper/ …       # each: index.tsx + components/ + styled.tsx
   │  └─ …
   │
   ├─ layouts/                        # structural shells: Navbar, Modal, Toast, Pagination, NotFound
   ├─ constants/                      # CLIENT constants: api (axios), fetcher, formatters, env
   ├─ styles/                         # global.ts design tokens (--pc-*)
   ├─ types/                          # CLIENT-facing types, by domain
   │
   └─ server/                         # ALL server-only code (imports "server-only")
      ├─ lib/                         # handler, auth, cookies, csrf, rateLimit, response, clientIp, upload
      │  └─ index.ts                  # barrel
      ├─ services/                    # BUSINESS LOGIC, one folder per domain
      │  ├─ auth/  users/  vendors/  menu/  timetable/  dailyOrders/
      │  ├─ buyerOrders/  payments/  reviews/  notifications/  analytics/
      │  ├─ admin/  whatsappTvs/  audit/  push/
      │  └─ …                         # each fn its own file + index.ts barrel
      ├─ models/                      # Mongoose models, one folder per collection
      │  ├─ campuses/  schools/  users/  refreshTokens/  vendorProfiles/
      │  ├─ menuItems/  timetableEntries/  dailyOrders/  buyerOrders/
      │  ├─ payments/  refunds/  reviews/  notifications/  auditLogs/
      │  ├─ analyticsSnapshots/  whatsappTvs/  pushSubscriptions/  siteConfigs/
      │  │   # each: index.ts (schema + *DB fns) + types.ts (interfaces, enums, defaults)
      │  └─ index.ts                  # barrel
      ├─ validators/                  # zod schemas, one folder per domain → validate.ts
      ├─ providers/                   # external wrappers: paystack, sendchamp, resend, s3
      ├─ constants/                   # environments.ts, errors/, cron.ts, siteConfigs helpers, kobo, tokens
      ├─ databases/                   # mongoDB.ts (singleton), redis.ts (singleton + helpers)
      ├─ metrics/                     # prom-client histograms + renderMetrics()
      ├─ middleware/                  # domain guards (campus scope, role, ownership)
      ├─ helpers/                     # S3 helpers, receipt PDF, order-number, otp, completeness
      ├─ runtime/                     # bootstrap.ts (composition root)
      └─ types/                       # server types (IJwtPayload, IAuthResult, …)
```

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Route file | `route.ts` with `export const GET/POST/…` | `app/api/orders/route.ts` |
| Route metrics label | stable string with bracketed params | `"/api/orders/[orderId]"` |
| Service function | one verb-phrase per file | `services/buyerOrders/placeOrder.ts` |
| Model access fn | `<verb><Thing>DB` | `getVendorProfileDB`, `markOrderPaidDB` |
| Collection folder | plural camelCase | `models/buyerOrders/` |
| Mongo collection name | plural (set via `collection` option) | `buyer_orders` or `buyerOrders` — pick one house style; see conventions doc |
| zod schema | `<op><Thing>{Body|Query|Params}Schema` | `placeOrderBodySchema` |
| Feature UI | `<Feature>Wrapper/` under `libs/` | `libs/CheckoutWrapper/` |
| SWR hook | `use<Thing>` under `hooks/<Domain>/` | `hooks/Order/useMyOrders.tsx` |
| Styled prop | `$`-prefixed transient prop | `$variant`, `$size` |
| Design token | `--pc-*` CSS custom property | `--pc-color-primary` |

## Where old `prechop-api` code lands

| prechop-api | Prechop (new) |
|---|---|
| `src/modules/<m>/<m>.routes.ts` | `src/app/api/<m>/**/route.ts` |
| `src/modules/<m>/<m>.service.ts` | `src/server/services/<m>/*.ts` |
| `src/modules/<m>/<m>.repository.ts` | folded into `src/server/models/<coll>/*DB` |
| `src/modules/<m>/<m>.schema.ts` | `src/server/validators/<m>/validate.ts` |
| `src/middleware/*` | `src/server/lib/*` + `src/server/middleware/*` |
| `src/providers/*` | `src/server/providers/*` |
| `src/lib/*` | `src/server/helpers/*` + `src/server/constants/*` |
| `src/jobs/*` (BullMQ) | `src/server/constants/cron.ts` + fire-and-forget service calls |
| `prisma/schema.prisma` | `src/server/models/*/index.ts` (Mongoose) |

See `data-and-api/04-prisma-to-mongoose-migration.md` for the model-by-model mapping.
