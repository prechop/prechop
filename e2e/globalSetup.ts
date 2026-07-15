// Provision a fresh, throwaway e2e fixture database before the suite runs.
//
// Drop-then-seed, in that order, on purpose: the seed is idempotent by natural
// key, so seeding a dirty DB is a no-op that leaves yesterday's expired cutoffs
// in place. Dropping first is what makes the fixture's age zero.

import { execFileSync } from "node:child_process";
import { dropE2eDatabase, e2eDbName, e2eMongoUri } from "./dbFixture";
import { E2E_APP_ENV } from "./env";

export default async function globalSetup(): Promise<void> {
	const dbName = e2eDbName();
	const uri = e2eMongoUri();

	console.log(`[e2e] provisioning fixture database ${dbName}`);
	// Throws (via assertDroppableE2eDb) rather than touching the app DB.
	await dropE2eDatabase(dbName);

	// Same command as `npm run seed`, with the DB and every crypto-sensitive
	// value pinned to what the webServer will use. Shell env wins over
	// `--env-file`, so neither the app DB nor the developer's real ENCRYPTION_KEY
	// can leak in from `.env` — which matters because a seed encrypted with a
	// different key produces users the server can never find.
	execFileSync(
		process.execPath,
		[
			"--conditions",
			"react-server",
			"--import",
			"tsx",
			"--env-file=.env",
			"scripts/seed.ts",
		],
		{
			stdio: "inherit",
			env: {
				...process.env,
				...E2E_APP_ENV,
				DB_NAME: dbName,
				MONGODB_URI: uri,
			},
		},
	);

	console.log(`[e2e] fixture database ${dbName} seeded`);
}
