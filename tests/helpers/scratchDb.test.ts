// The scratch-DB sweeper is destructive code pointed at a Mongo instance that
// also holds the real `prechop` database and other projects' data. Its guards
// are the only thing standing between a test run and someone's real data, so
// they are tested here against a live server rather than trusted by reading.

import mongoose from "mongoose";
import { afterAll, describe, expect, it } from "vitest";
import {
	isScratchDbName,
	makeRunId,
	SCRATCH_DB_PREFIX,
	STALE_SCRATCH_DB_MS,
	scratchDbName,
	scratchDbStartedAt,
	sweepStaleScratchDatabases,
	testMongoUri,
} from "./scratchDb";

/** Names this file creates on the real server, dropped in afterAll regardless. */
const created = new Set<string>();

async function withClient<T>(
	fn: (c: mongoose.mongo.MongoClient) => Promise<T>,
) {
	const client = new mongoose.mongo.MongoClient(testMongoUri(), {
		serverSelectionTimeoutMS: 5000,
	});
	try {
		await client.connect();
		return await fn(client);
	} finally {
		await client.close();
	}
}

/** A database only exists once it holds data. */
async function createDb(name: string): Promise<void> {
	created.add(name);
	await withClient(async (c) => {
		await c.db(name).collection("probe").insertOne({ ok: 1 });
	});
}

async function dbExists(name: string): Promise<boolean> {
	return withClient(async (c) => {
		const { databases } = await c
			.db()
			.admin()
			.listDatabases({ nameOnly: true });
		return databases.some((d) => d.name === name);
	});
}

afterAll(async () => {
	await withClient(async (c) => {
		for (const name of created) {
			// Belt and braces: never let this file's own cleanup off the leash.
			if (isScratchDbName(name)) await c.db(name).dropDatabase();
		}
	});
});

describe("scratch-db name guard", () => {
	it("never classifies a real database as scratch", () => {
		// The one that matters: the app's own DB lives on the same instance.
		expect(isScratchDbName("prechop")).toBe(false);
		expect(isScratchDbName("admin")).toBe(false);
		expect(isScratchDbName("local")).toBe(false);
		expect(isScratchDbName("prechop-prod")).toBe(false);
		// A bare prefix with no run id is not a scratch DB either.
		expect(isScratchDbName(SCRATCH_DB_PREFIX)).toBe(false);
	});

	it("classifies a generated scratch name as scratch", () => {
		expect(isScratchDbName(scratchDbName(makeRunId(), "3"))).toBe(true);
	});

	it("reads back the run's start time, and refuses to guess at foreign names", () => {
		const before = Date.now();
		const name = scratchDbName(makeRunId(), "1");
		const startedAt = scratchDbStartedAt(name);
		expect(startedAt).not.toBeNull();
		// Encoded to ms, so it must bracket the moment we minted it.
		expect(startedAt!).toBeGreaterThanOrEqual(before - 1000);
		expect(startedAt!).toBeLessThanOrEqual(Date.now() + 1000);

		// Names from other tools / the old scheme are unreadable BY DESIGN — the
		// sweeper must then leave them alone rather than assume they are junk.
		expect(
			scratchDbStartedAt("prechop-vitest-verify-mrm8vz5k-41724"),
		).toBeNull();
		expect(scratchDbStartedAt("prechop-vitest-12345-0")).toBeNull();
		expect(scratchDbStartedAt("prechop")).toBeNull();
	});
});

describe("sweepStaleScratchDatabases", () => {
	it("drops our stale databases but spares live and foreign ones", async () => {
		const pid = process.pid;
		const stale = `${SCRATCH_DB_PREFIX}t${(Date.now() - STALE_SCRATCH_DB_MS - 60_000).toString(36)}-${pid}-sweepstale`;
		const fresh = `${SCRATCH_DB_PREFIX}t${Date.now().toString(36)}-${pid}-sweepfresh`;
		// Mimics a DB created by a different tool that shares the prefix.
		const foreign = `${SCRATCH_DB_PREFIX}verify-${Date.now().toString(36)}-${pid}`;

		await createDb(stale);
		await createDb(fresh);
		await createDb(foreign);

		const dropped = await sweepStaleScratchDatabases();

		// Only the aged, ours-by-construction database goes.
		expect(dropped).toContain(stale);
		expect(await dbExists(stale)).toBe(false);

		// A run that started seconds ago is almost certainly still executing.
		expect(dropped).not.toContain(fresh);
		expect(await dbExists(fresh)).toBe(true);

		// We cannot prove we created this one, so we must not delete it — this is
		// the regression that dropped a live database 90s into someone else's run.
		expect(dropped).not.toContain(foreign);
		expect(await dbExists(foreign)).toBe(true);
	});

	it("never returns a non-scratch database, whatever else is on the server", async () => {
		const dropped = await sweepStaleScratchDatabases();
		for (const name of dropped) {
			expect(isScratchDbName(name)).toBe(true);
		}
		// The app database is still there.
		expect(dropped).not.toContain("prechop");
	});
});
