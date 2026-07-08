// Shared Mongo test harness. Every DB-touching test file connects in
// `beforeAll` and calls `dropAndDisconnect()` in `afterAll` so a crash still
// leaves the scratch database dropped.
//
// SAFETY: `dropAndDisconnect` refuses to drop any database whose name does not
// start with the per-worker scratch prefix — a hard guard against ever nuking
// the real `prechop` dev database.

import mongoose from "mongoose";
import { connectMongoDB, disconnectMongoDB } from "@/server/databases/mongoDB";

export const SCRATCH_DB_PREFIX = "prechop-vitest-";

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
	const db = mongoose.connection.db!;
	for (let attempt = 0; attempt < 10; attempt++) {
		await mongoose.connection.dropDatabase();
		await sleep(120);
		const remaining = await db.listCollections().toArray();
		if (remaining.length === 0) break;
	}
	await disconnectMongoDB();
	// Final out-of-band drop via a raw driver client (no mongoose model
	// registration → no autoIndex), so a straggler that recreated empty
	// collections after our mongoose drop can't leave the scratch DB behind.
	await rawDropDatabase(dbName);
}

/** Drop a scratch DB with a throwaway raw driver connection. Scratch-name guarded. */
async function rawDropDatabase(dbName: string): Promise<void> {
	if (!dbName.startsWith(SCRATCH_DB_PREFIX)) return;
	const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
	// Use the mongodb driver mongoose re-exports (not a direct dep in pnpm).
	const client = new mongoose.mongo.MongoClient(uri, {
		serverSelectionTimeoutMS: 5000,
	});
	try {
		await client.connect();
		await client.db(dbName).dropDatabase();
	} catch {
		// best effort
	} finally {
		await client.close();
	}
}

/** Wipe all documents from every collection between tests where useful. */
export async function clearCollections(): Promise<void> {
	assertScratchDb();
	const collections = await mongoose.connection.db!.collections();
	await Promise.all(collections.map((c) => c.deleteMany({})));
}

/** Random-ish Nigerian phone so parallel workers/tests never collide. */
export function uniquePhone(): string {
	// 0 + 10 digits. Use the pid + a random tail to stay unique per worker.
	const tail = Math.floor(1_000_000_000 + Math.random() * 8_999_999_999);
	return `0${tail.toString().slice(0, 10)}`;
}

/** Fresh ObjectId hex string. */
export function oid(): string {
	return new mongoose.Types.ObjectId().toString();
}
