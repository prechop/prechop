// Drop the e2e fixture database. Playwright runs globalTeardown even when the
// suite fails, so a red run leaves no database behind either.
//
// Opt out with E2E_KEEP_DB=1 when you need to inspect the data a failure left.

import { dropE2eDatabase, e2eDbName, flushE2eRedis } from "./dbFixture";

export default async function globalTeardown(): Promise<void> {
	const dbName = e2eDbName();
	if (process.env.E2E_KEEP_DB === "1") {
		console.log(`[e2e] E2E_KEEP_DB=1 — keeping ${dbName} for inspection`);
		return;
	}
	const dropped = await dropE2eDatabase(dbName);
	console.log(
		dropped
			? `[e2e] dropped fixture database ${dbName}`
			: `[e2e] fixture database ${dbName} not dropped (see warning above)`,
	);

	// Mongo is only half the state. Refresh-token families, OTP codes and rate
	// limits live in Redis with ttls up to 30 days, and dropping the database
	// does not touch them.
	const flushed = await flushE2eRedis();
	console.log(`[e2e] flushed ${flushed} keys from the e2e redis db`);
}
