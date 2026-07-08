# 04 — Coding Conventions

The house style, inherited from managerenta and gkoi. Follow the surrounding code; these are the
rules that keep the codebase consistent.

## Client / server boundary

- **`src/server/**` is server-only.** Every file there imports `"server-only"`. Never import a
  `src/server` module from a client component or a `src/hooks` file.
- **`src/constants`** is client-safe; **`src/server/constants`** is server-only. Don't cross them.
- Route handlers set `export const runtime = "nodejs";` (Mongoose/bcrypt/sharp are not edge-safe).

## Route handlers

- Keep them **thin**: authenticate, validate, delegate to a service, shape the response. **No
  Mongoose in a route file.**
- Wrap with `withApiHandler({ route }, withAuth(async ({ req, auth, context }) => { … }))`.
- Pass a **stable `route` string** with bracketed params (`"/api/orders/[orderId]"`) — it's the
  metrics label.
- `try/catch` returning `handleError(error)` inside the handler (belt-and-suspenders with
  `withApiHandler`).
- In Next 16, **`params` is a Promise** — `const { id } = await context.params;`.

## Validation

- One zod schema per shape in `src/server/validators/<domain>/validate.ts`, named
  `<op><Thing>{Body|Query|Params}Schema`.
- `.safeParse()` inputs; on failure **throw the sentinel `ErrInvalidFields`** — never return the
  raw zod error. Query/param schemas use `.strict()`.

## Services

- One function per file; barrel `index.ts` per domain.
- Business logic, orchestration, cache invalidation, S3, audit, notify live here.
- **Re-check ownership** — never trust a client-supplied ID for authorization.
- Side-effects that mustn't block the response are **fire-and-forget**: `void notify(...)`,
  `void recordAuditEvent(...)` — they never throw to the caller.

## Models (`*DB` functions)

- Named `<verb><Thing>DB` (`getVendorProfileDB`, `markOrderPaidDB`).
- **Reads via aggregation pipelines** so the shared `pre("aggregate")` hooks apply (soft-delete
  filter, `id` projection, signed-URL resolution). Writes via `findOneAndUpdate`/`save`.
- Wrap every function body in the `database_request_duration_seconds` timer; call it on both
  success and error paths.
- **Never throw to the caller** — return `null`/`[]` on error and log.
- **Always include `campusId`** in scoped queries. Escape user input before `$regex`.
- Register models with the hot-reload-safe idempotent pattern:
  `(mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema, collection)`.
- Secrets/PII fields use `select:false`; encrypt PII (`phone`, `accountNumber`, `whatsappNumber`).
- Guard mass-assignment with a **path allowlist** for any raw-update function.

## Response & errors

- Envelope `{ code, message, data }` via `ok/created/fail`. Never hand-roll `NextResponse.json`
  for the standard shape (list endpoints adding `total`/`stats` are the documented exception).
- Errors are **singleton `Error` sentinels** matched by reference in `handleError`. Add a new one
  in `server/constants/errors` and map it — don't throw ad-hoc `new Error("...")` for a client-facing failure.

## Money

- **Always integer kobo** in storage and computation. Convert Naira→kobo at the service boundary
  (`nairaToKobo`); format to Naira only for display (`formatKobo`). No floats.

## Frontend

- **Pages are `<Suspense>` wrappers** around a `libs/<Feature>Wrapper`. Real UI lives in `libs/*`.
- **Data via SWR hooks** in `hooks/<Domain>/use*.tsx`; the hook shapes a **presentation
  view-model** (formatted strings, badge colors, derived stats) in `useMemo`. Components stay dumb.
- Conditional fetch with a `null` SWR key; mutate then revalidate after writes.
- The axios client (`constants/api.ts`) is `withCredentials:true` and redirects to `/login` on 401
  (except public paths).
- **Primitives** are `components/<Name>/{index.tsx, styled.tsx}`; styled props are `$`-prefixed
  transient props referencing `--pc-*` tokens. Dark mode = token swap under `[data-theme="dark"]`.

## Naming quick reference

| Thing | Rule |
|---|---|
| service fn file | verb-phrase, one per file |
| model access fn | `<verb><Thing>DB` |
| collection folder | plural camelCase (`buyerOrders`) |
| zod schema | `<op><Thing>{Body|Query|Params}Schema` |
| feature UI | `libs/<Feature>Wrapper/` |
| SWR hook | `use<Thing>` |
| styled prop | `$`-prefixed |
| design token | `--pc-*` |
| sentinel error | `Err<Thing>` |

## Tooling

- **Biome** for lint+format (tabs, width 4). Run `biome check` before committing.
- **Absolute imports** via `@/*`.
- No `console.log` in committed server code — use the structured logger; never log secrets/PII
  (redact `authorization`/`cookie`).

## Git

- Small, focused commits per module/phase. No `Co-Authored-By` trailer (house rule).
- Don't commit `.env*`; ensure `.dockerignore` excludes `.env*` and `.git`.
