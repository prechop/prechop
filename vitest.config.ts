import * as path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
			// `server-only` throws outside a React Server Component graph;
			// unit tests run under plain node, so stub it out.
			"server-only": path.resolve(
				__dirname,
				"tests/stubs/server-only.ts",
			),
		},
	},
	test: {
		environment: "node",
		globals: true,
		include: ["tests/**/*.test.ts"],
		setupFiles: ["tests/setup.ts"],
		// Mints the per-run id and guarantees the scratch databases are dropped
		// even when a worker crashes before its `afterAll` can run.
		globalSetup: ["tests/globalSetup.ts"],
		hookTimeout: 30000,
		testTimeout: 30000,
		coverage: {
			provider: "v8",
			include: ["src/server/**/*.ts"],
			exclude: [
				"src/server/**/types.ts",
				"src/server/types/**",
				"src/server/**/*.d.ts",
				"src/server/runtime/**",
				"src/server/constants/cron.ts",
			],
			reporter: ["text-summary", "text", "html"],
			reportsDirectory: "coverage",
		},
	},
});
