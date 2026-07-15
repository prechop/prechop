// Runs once in the main vitest process, around the whole run.
//
// Mints the run id that workers stamp into their scratch database names, sweeps
// leftovers from runs that died before their `afterAll` could fire, and drops
// this run's databases on the way out — including any left by a worker that
// crashed, which per-file teardown by definition cannot clean up.

import {
	dropRunScratchDatabases,
	makeRunId,
	sweepStaleScratchDatabases,
} from "./helpers/scratchDb";

export async function setup() {
	// Workers are forked after this returns, so they inherit the run id through
	// the environment. `tests/setup.ts` falls back to minting its own if this
	// ever stops being true, at the cost of a less precise global teardown.
	const runId = process.env.PRECHOP_TEST_RUN_ID ?? makeRunId();
	process.env.PRECHOP_TEST_RUN_ID = runId;

	const swept = await sweepStaleScratchDatabases();
	if (swept.length > 0) {
		console.log(
			`[vitest] swept ${swept.length} stale scratch database(s): ${swept.join(", ")}`,
		);
	}

	// Returned teardown runs even when the suite fails, so a red run cleans up
	// exactly like a green one.
	return async () => {
		const dropped = await dropRunScratchDatabases(runId);
		if (dropped.length > 0) {
			console.log(
				`[vitest] dropped ${dropped.length} leftover scratch database(s) from run ${runId}: ${dropped.join(", ")}`,
			);
		}
	};
}
