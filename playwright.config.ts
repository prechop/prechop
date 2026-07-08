import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT ?? "3100";
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: "./e2e",
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
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		// `next start` runs in production mode and would otherwise load the
		// placeholder remote URIs from `.env.production`. Pin the e2e server to
		// the local Mongo/Redis the seed populated so smoke tests are hermetic.
		env: {
			DISABLE_RATE_LIMIT: "1",
			MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
			DB_NAME: process.env.DB_NAME ?? "prechop",
			REDIS_URI: process.env.REDIS_URI ?? "redis://127.0.0.1:6379",
		},
	},
});
