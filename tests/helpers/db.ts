// Shared Mongo test harness. Every DB-touching test file connects in
// `beforeAll` and calls `dropAndDisconnect()` in `afterAll` so a crash still
// leaves the scratch database dropped.
//
// SAFETY: `dropAndDisconnect` refuses to drop any database whose name does not
// start with the per-worker scratch prefix — a hard guard against ever nuking
// the real `prechop` dev database.

import mongoose from "mongoose";
import { connectMongoDB, disconnectMongoDB } from "@/server/databases/mongoDB";
import { dropScratchDatabases, SCRATCH_DB_PREFIX } from "./scratchDb";

export { SCRATCH_DB_PREFIX };

export async function connectTestDB(): Promise<typeof mongoose> {
	const conn = await connectMongoDB();
	assertScratchDb();
	return conn;
}

/** Throws unless the live connection points at a per-worker scratch database. */
function assertScratchDb(): string {
	const name = mongoose.connection.name ?? "";
	if (!name.startsWith(SCRATCH_DB_PREFIX)) {
		throw new Error(
			`Refusing to operate on non-scratch database "${name}". ` +
				`Test DBs must start with "${SCRATCH_DB_PREFIX}".`,
		);
	}
	return name;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Drop the scratch database and disconnect. Asserts the scratch-name guard
 * BEFORE dropping so a misconfigured connection can never wipe a real DB.
 *
 * The code under test fires unawaited writes (audit logs, notifications, and —
 * via mongoose `autoIndex` — background index builds). Any of these can land
 * just after `dropDatabase()` and recreate empty collections, leaking an empty
 * scratch DB. So we drop in a short convergence loop with the connection still
 * open: keep dropping until no collections reappear, then disconnect (after
 * which nothing can reconnect for the final file in a worker).
 */
export async function dropAndDisconnect(): Promise<void> {
	if (mongoose.connection.readyState === 0) return;
	const dbName = assertScratchDb();
	try {
		const db = mongoose.connection.db!;
		for (let attempt = 0; attempt < 10; attempt++) {
			await mongoose.connection.dropDatabase();
			await sleep(120);
			const remaining = await db.listCollections().toArray();
			if (remaining.length === 0) break;
		}
	} finally {
		// Disconnect and the out-of-band drop must happen even if the loop above
		// throws (a dropped connection mid-teardown used to leak the whole DB).
		await disconnectMongoDB().catch(() => {});
		// Final drop via a raw driver client (no mongoose model registration → no
		// autoIndex), so a straggler that recreated empty collections after the
		// mongoose drop can't leave the scratch DB behind. Scratch-name guarded
		// inside `dropScratchDatabases`.
		await dropScratchDatabases((name) => name === dbName);
	}
}

/** Wipe all documents from every collection between tests where useful. */
export async function clearCollections(): Promise<void> {
	assertScratchDb();
	const collections = await mongoose.connection.db!.collections();
	await Promise.all(collections.map((c) => c.deleteMany({})));
}

/**
 * Random-ish Nigerian phone in the LOCAL `0…` form — the shape a buyer actually
 * types. The app normalizes it to E.164 on the way in; see `e164()`.
 */
export function uniquePhone(): string {
	// Valid Nigerian mobile number with a supported 0801 prefix.
	const tail = Math.floor(1_000_000 + Math.random() * 8_999_999);
	return `0801${tail.toString()}`;
}

/**
 * The E.164 form the app is expected to store for a local `0…` number.
 *
 * Computed here independently rather than by calling the app's
 * `normalizeNigerianMobilePhone` — a test that derives its expectation from the
 * code under test passes no matter what that code does.
 */
export function e164(localPhone: string): string {
	return `+234${localPhone.replace(/^0/, "")}`;
}

/** Fresh ObjectId hex string. */
export function oid(): string {
	return new mongoose.Types.ObjectId().toString();
}
