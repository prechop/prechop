// Scratch-database naming and sweeping, shared by BOTH sides of the run:
//
//   - `tests/setup.ts`      (worker side)  — names this worker's scratch DB.
//   - `tests/globalSetup.ts` (main process) — sweeps leftovers before the run
//                                             and drops this run's DBs after it.
//
// WHY THIS EXISTS: per-file `afterAll` teardown only runs when a file finishes.
// A crashed worker, a `process.exit`, or a Ctrl-C leaves the scratch database
// behind, and those accumulated on the shared Docker Mongo. The global teardown
// is the net under the per-file teardown; the startup sweep is the net under
// *that*, for a run whose main process was killed outright.
//
// SAFETY: every drop in this module funnels through `isScratchDbName`, which
// only matches `prechop-vitest-<...>`. The app database (`prechop`) cannot match
// — the prefix requires the literal `-vitest-` segment — and neither can any of
// the other projects' databases on the shared instance.

import mongoose from "mongoose";

export const SCRATCH_DB_PREFIX = "prechop-vitest-";

/**
 * Where tests connect when MONGODB_URI is not set: the DEDICATED, EPHEMERAL test
 * Mongo (`prechop-test-mongo`, compose service `test-mongo`, host port 27019).
 *
 * Why not the other two ports on this box:
 *
 *   - 27017 is a NATIVELY-INSTALLED Windows MongoDB (PID 6132; `docker ps` shows
 *     nothing on 27017). Project rules forbid tests depending on a host-installed
 *     service — it is not reproducible, and it is not there in CI.
 *   - 27018 is the SHARED Docker Mongo — a replica set that is also the app's
 *     primary datastore, used by other projects on this machine. Tests must not
 *     share it.
 *
 * The earlier note here said 27018 ran ~10x slower and so the ports could not be
 * aligned. That was real, but the cause was contention on the shared replica set,
 * not Mongo itself. Re-measured on the dedicated standalone container
 * (tests/services/orderCapacity.test.ts, test-execution time):
 *
 *     27017 (native)              5.01s
 *     27018 (shared replica set)  6.38s
 *     27019 (dedicated, tmpfs)    1.09s   ← fastest of the three
 *
 * So the penalty is gone: 27019 is faster than the port we were fleeing to.
 *
 * The container is standalone (no replica set), which is safe ONLY because
 * `src/**` uses no transactions and no change streams today. If either is
 * introduced, this container must be converted to a single-node replica set or
 * every such test will fail with "Transaction numbers are only allowed on a
 * replica set member or mongos".
 *
 * Whichever instance a run uses, the sweeping below cleans up after it.
 */
export const DEFAULT_MONGODB_URI = "mongodb://localhost:27019";

/**
 * A scratch DB older than this belongs to a run that crashed or was
 * interrupted — no healthy run lives for two hours. Anything younger might be a
 * concurrent `vitest run`, so the sweep leaves it alone.
 */
export const STALE_SCRATCH_DB_MS = 2 * 60 * 60 * 1000;

export function testMongoUri(): string {
	return process.env.MONGODB_URI ?? DEFAULT_MONGODB_URI;
}

/** True only for a per-run scratch DB. Never `prechop`, never anything else. */
export function isScratchDbName(name: string): boolean {
	return (
		name.startsWith(SCRATCH_DB_PREFIX) &&
		name.length > SCRATCH_DB_PREFIX.length
	);
}

/**
 * Identifies one `vitest run` and encodes when it started: `t<base36 ms>-<pid>`.
 * The pid alone is not enough — pids are reused, and two concurrent runs must
 * never share a scratch DB. The timestamp is what makes staleness knowable.
 */
export function makeRunId(): string {
	return `t${Date.now().toString(36)}-${process.pid}`;
}

export function scratchDbName(runId: string, poolId: string): string {
	return `${SCRATCH_DB_PREFIX}${runId}-${poolId}`;
}

/**
 * The start time encoded in a scratch DB name, or `null` for a name this
 * version didn't create (a leftover from the old `<pid>-<pool>` scheme).
 */
export function scratchDbStartedAt(name: string): number | null {
	if (!isScratchDbName(name)) return null;
	const stamp = name.slice(SCRATCH_DB_PREFIX.length).split("-")[0];
	const match = /^t([0-9a-z]+)$/.exec(stamp);
	if (!match) return null;
	const ms = Number.parseInt(match[1], 36);
	return Number.isSafeInteger(ms) && ms > 0 ? ms : null;
}

type RawClient = InstanceType<typeof mongoose.mongo.MongoClient>;

/**
 * Run `fn` against a throwaway raw driver client — no mongoose model
 * registration, so no `autoIndex` write can recreate a database we just
 * dropped. Best-effort: a Mongo that isn't reachable must not fail the run.
 */
async function withRawClient<T>(fn: (client: RawClient) => Promise<T>) {
	const client = new mongoose.mongo.MongoClient(testMongoUri(), {
		serverSelectionTimeoutMS: 5000,
	});
	try {
		await client.connect();
		return await fn(client);
	} catch {
		return null;
	} finally {
		await client.close().catch(() => {});
	}
}

/** Drop every scratch database matching `shouldDrop`. Returns the names dropped. */
export async function dropScratchDatabases(
	shouldDrop: (name: string) => boolean,
): Promise<string[]> {
	const dropped = await withRawClient(async (client) => {
		const { databases } = await client
			.db()
			.admin()
			.listDatabases({ nameOnly: true });
		const names = databases
			.map((d) => d.name)
			// Order matters: the scratch guard runs before the caller's predicate,
			// so a buggy predicate still cannot reach a real database.
			.filter(isScratchDbName)
			.filter(shouldDrop);
		for (const name of names) {
			await client.db(name).dropDatabase();
		}
		return names;
	});
	return dropped ?? [];
}

/**
 * Drop leftovers from runs that crashed or were killed.
 *
 * Two deliberate restrictions, both learned the hard way:
 *
 *  - Only names THIS scheme produces are considered. Other tools on this box
 *    create their own `prechop-vitest-*` databases (e.g. `prechop-vitest-verify-…`);
 *    an earlier version of this sweep treated any unrecognised name as a stale
 *    leftover and dropped a live one 90 seconds into someone else's run. If we
 *    cannot prove we created it, we do not touch it.
 *  - Only databases older than `STALE_SCRATCH_DB_MS` are dropped, so a
 *    concurrent `vitest run` is never nuked mid-flight.
 */
export async function sweepStaleScratchDatabases(
	now: number = Date.now(),
): Promise<string[]> {
	return dropScratchDatabases((name) => {
		const startedAt = scratchDbStartedAt(name);
		// Not our naming scheme → not ours to delete.
		if (startedAt === null) return false;
		return now - startedAt > STALE_SCRATCH_DB_MS;
	});
}

/** Drop every scratch DB created by one run — catches a worker that died. */
export async function dropRunScratchDatabases(
	runId: string,
): Promise<string[]> {
	const prefix = `${SCRATCH_DB_PREFIX}${runId}-`;
	return dropScratchDatabases((name) => name.startsWith(prefix));
}
