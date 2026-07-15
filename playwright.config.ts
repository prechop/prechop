import { defineConfig, devices } from "@playwright/test";
import { e2eDbName, e2eMongoUri, e2eRedisUri } from "./e2e/dbFixture";
import { E2E_APP_ENV } from "./e2e/env";

// 3100 is a popular default and was found OCCUPIED BY ANOTHER PROJECT on this
// machine (`adverta-web-1` publishes 0.0.0.0:3100->3000). Combined with the old
// `reuseExistingServer: true`, Playwright saw "something answers on 3100",
// skipped starting our server, and ran the entire suite against that other
// application — 25 failures whose real cause was that we were testing the wrong
// app. 3187 is deliberately obscure; E2E_PORT still overrides.
const PORT = process.env.E2E_PORT ?? "3187";
const BASE_URL = `http://127.0.0.1:${PORT}`;
// Resolved once here so globalSetup, globalTeardown and the webServer all agree
// on which database this run owns.
const E2E_DB = e2eDbName();
const E2E_MONGO_URI = e2eMongoUri();
// A dedicated Redis logical db, so the refresh tokens / OTPs / rate limits an
// e2e run creates can be flushed wholesale without touching db0 — which the
// running app and every other project on this box share.
const E2E_REDIS_URI = e2eRedisUri();

// The SPECS also talk to Mongo directly (to assert persisted state), and they
// resolve the database as `process.env.DB_NAME ?? "prechop"`. Playwright loads
// this config in the main process and in every worker, so exporting the fixture
// identity here is what stops those direct reads/writes from landing on the
// `prechop` APP DATABASE — which is both against project rules and simply wrong:
// a spec asserting "the vendor is now ACTIVE" was reading a stale app-DB row and
// failing with PENDING_REVIEW while the fixture DB was correct all along.
process.env.DB_NAME = E2E_DB;
process.env.MONGODB_URI = E2E_MONGO_URI;
// The specs build their own ioredis client from REDIS_URI to plant OTP hashes;
// they must land in the same logical db the server reads.
process.env.REDIS_URI = E2E_REDIS_URI;

export default defineConfig({
	testDir: "./e2e",
	// Drops + re-seeds a throwaway fixture DB, then drops it again after the
	// run (even on failure). See e2e/dbFixture.ts for why this is not optional.
	globalSetup: "./e2e/globalSetup.ts",
	globalTeardown: "./e2e/globalTeardown.ts",
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: [["list"], ["html", { open: "never" }]],
	timeout: 60_000,
	use: {
		baseURL: BASE_URL,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: `npm run start -- --port ${PORT}`,
		url: BASE_URL,
		// NEVER reuse whatever happens to answer on this port. `reuseExistingServer`
		// only probes that the URL responds — it cannot tell OUR server from a
		// stranger's, and on a shared dev box that is a coin flip. Starting our own
		// every time also guarantees the env below is actually applied; a reused
		// server silently keeps its old DB_NAME/REDIS_URI/ENCRYPTION_KEY. If the
		// port is busy the run now fails loudly instead of testing the wrong app.
		reuseExistingServer: false,
		timeout: 120_000,
		// `next start` runs in production mode and would otherwise load the
		// placeholder remote URIs from `.env.production`. Pin the e2e server to
		// the local Mongo/Redis the fixture seed populated.
		//
		// Because this is NODE_ENV=production, `assertRuntimeConfig` applies in
		// full: `E2E_APP_ENV` is what it demands of a production boot. That is
		// the point — e2e exercises the same guard real deploys do, so a change
		// that would break production boot breaks e2e first.
		//
		// `E2E_APP_ENV` is shared verbatim with the seed in e2e/globalSetup.ts.
		// It must stay that way: a server whose ENCRYPTION_KEY differs from the
		// seed's cannot find a single seeded user.
		env: {
			...E2E_APP_ENV,
			// The throwaway fixture DB globalSetup just seeded — never the
			// `prechop` app database, which e2e would otherwise WRITE to.
			MONGODB_URI: E2E_MONGO_URI,
			DB_NAME: E2E_DB,
			REDIS_URI: E2E_REDIS_URI,
		},
	},
});
