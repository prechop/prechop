// Naming + dropping for the e2e fixture database, shared by globalSetup and
// globalTeardown.
//
// WHY A DEDICATED DB: e2e used to run against `prechop` — the app's primary
// database on the shared Docker Mongo. That is wrong twice over:
//
//  1. Project rules forbid tests touching the app DB at all, and e2e WRITES
//     (it registers vendors, places orders). It also races anything else using
//     that database right now.
//  2. It cannot work. The seed is idempotent *by natural key* ("skipped if
//     already present"), so it can never refresh a fixture whose correctness
//     depends on TIME. The listings in `prechop` were seeded 2026-07-11 with
//     cutoffs that have long passed; every one had gone CLOSED/DRAFT, the
//     marketplace returned zero listings, and re-running the seed refused to
//     fix them because a row with that title already existed. An e2e suite that
//     needs "a listing whose cutoff is in the future" is therefore broken on
//     every day but the day the DB was first seeded.
//
// Dropping and re-seeding a throwaway DB per run makes the fixture's age zero
// every time, which is the only way a cutoff-sensitive test is stable.

import mongoose from "mongoose";

export const E2E_DB_PREFIX = "prechop-e2e";

/** The fixture DB for this run. Overridable, but never the app database. */
export function e2eDbName(): string {
	return process.env.E2E_DB_NAME ?? E2E_DB_PREFIX;
}

export function e2eMongoUri(): string {
	return process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27018";
}

/**
 * A DEDICATED Redis logical database for e2e (index 15 — only db0 is in use on
 * the shared instance).
 *
 * Redis keys are NOT namespaced by DB_NAME, so dropping the Mongo fixture leaves
 * Redis untouched: a suite that logs in 10 times leaves 12 `auth:rt:*` refresh
 * token families behind, each with a 30-DAY ttl. They cannot be swept by pattern
 * either — `auth:rt:*` on db0 belongs to the running app and every other agent
 * on this box, so a wildcard delete would log real sessions out. An isolated db
 * index is the only cleanup that is both complete and safe.
 */
export const E2E_REDIS_DB_INDEX = 15;

export function e2eRedisUri(): string {
	return (
		process.env.E2E_REDIS_URI ??
		`redis://127.0.0.1:6379/${E2E_REDIS_DB_INDEX}`
	);
}

/** The logical db index in a redis URI, or 0 when it names none. */
export function redisDbIndex(uri: string): number {
	const path = new URL(uri).pathname.replace(/^\//, "");
	const index = Number.parseInt(path, 10);
	return Number.isInteger(index) ? index : 0;
}

/**
 * Flush ONLY the e2e Redis database. Refuses db0 outright — that is the shared
 * application database, and flushing it would wipe live sessions, rate limits
 * and OTPs belonging to the app and every other project on this Redis.
 */
export async function flushE2eRedis(): Promise<number> {
	const uri = e2eRedisUri();
	const index = redisDbIndex(uri);
	if (index === 0) {
		throw new Error(
			`[e2e] Refusing to flush redis db0 via "${uri}" — db0 is the SHARED application database. e2e must use a dedicated index (default ${E2E_REDIS_DB_INDEX}).`,
		);
	}
	const { default: IoRedis } = await import("ioredis");
	const redis = new IoRedis(uri, { maxRetriesPerRequest: 2 });
	try {
		const before = await redis.dbsize();
		await redis.flushdb();
		return before;
	} catch (error) {
		console.warn(
			`[e2e] could not flush redis db${index}:`,
			(error as Error).message,
		);
		return 0;
	} finally {
		await redis.quit().catch(() => {});
	}
}

/**
 * The one guard that makes dropping safe. `prechop` (the app DB) cannot match:
 * the name must start with the literal `prechop-e2e`. Anything else throws
 * rather than silently skipping, so a bad env var fails the run instead of
 * quietly nuking something real.
 */
export function assertDroppableE2eDb(name: string): void {
	if (!name.startsWith(E2E_DB_PREFIX)) {
		throw new Error(
			`[e2e] Refusing to drop database "${name}" — only databases prefixed "${E2E_DB_PREFIX}" are e2e fixtures. The app database must never be dropped.`,
		);
	}
}

/** Drop the fixture DB. Best-effort: an unreachable Mongo must not mask the real failure. */
export async function dropE2eDatabase(name: string): Promise<boolean> {
	assertDroppableE2eDb(name);
	const client = new mongoose.mongo.MongoClient(e2eMongoUri(), {
		serverSelectionTimeoutMS: 5000,
	});
	try {
		await client.connect();
		await client.db(name).dropDatabase();
		return true;
	} catch (error) {
		console.warn(`[e2e] could not drop ${name}:`, (error as Error).message);
		return false;
	} finally {
		await client.close().catch(() => {});
	}
}
