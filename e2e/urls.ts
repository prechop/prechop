// The e2e server's addresses, derived from E2E_PORT in ONE place.
//
// Every spec used to hardcode `http://127.0.0.1:3100` / `http://localhost:3100`
// in its own login helper (17 literals across 10 files). That made the port
// impossible to change — and it had to change: 3100 is a popular default and is
// occupied on this machine by an unrelated project's container, which Playwright
// then happily ran the whole suite against.
//
// Two different hosts on purpose:
//   * BASE_URL uses 127.0.0.1 — what Playwright's webServer binds and polls.
//   * ORIGIN uses localhost — the CSRF allow-list (`clientAppURLs`) trusts the
//     `localhost` eTLD+1, and `127.0.0.1` is NOT in it. A request sent with
//     `origin: http://127.0.0.1:…` is rejected with 403 "Origin not allowed".

export const E2E_PORT = process.env.E2E_PORT ?? "3187";
export const BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
export const ORIGIN = `http://localhost:${E2E_PORT}`;
