import { createHash, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { METRICS_TOKEN } from "@/server/constants";
import { connectMongoDB, Redis } from "@/server/databases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A health check that cannot fail tells you nothing at 3am. Both dependencies
// are probed with a real round-trip on every request:
//
//   * Mongo — `connectMongoDB()` returns a PROCESS-CACHED connection, so it
//     resolves instantly even after the server has gone away. Calling it alone
//     only proves we once connected. We follow it with an `admin().ping()` so a
//     dead-but-cached connection reports down.
//   * Redis — `PING` must round-trip and answer PONG.
//
// Every probe is bounded: a health endpoint that hangs fails the gate by
// timeout instead of answering, which is indistinguishable from a hung app.
const PROBE_TIMEOUT_MS = 5000;

type CheckState = "ok" | "down";

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(`probe timed out after ${ms}ms`)),
					ms,
				);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function probe(fn: () => Promise<void>): Promise<{
	state: CheckState;
	latencyMs: number;
	error?: string;
}> {
	const startedAt = Date.now();
	try {
		await withTimeout(fn(), PROBE_TIMEOUT_MS);
		return { state: "ok", latencyMs: Date.now() - startedAt };
	} catch (error) {
		return {
			state: "down",
			latencyMs: Date.now() - startedAt,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

type ProbeResult = Awaited<ReturnType<typeof probe>>;

// The error string can carry the dependency's host:port (e.g. an `ECONNREFUSED
// …:27017`), which is internal topology no anonymous caller should see. Only
// expose it to a metrics-token bearer; unauthenticated callers get latency but
// not the reason. The boolean `checks` map stays public — load balancers gate
// on it — and every down probe is logged server-side regardless, so ops keep
// the full detail without leaking it on the wire.
function detail({ latencyMs, error }: ProbeResult, authorized: boolean) {
	return authorized && error ? { latencyMs, error } : { latencyMs };
}

// Constant-time bearer-token check. Hashing both sides to a fixed 32-byte
// digest keeps the buffers equal-length by construction, so timingSafeEqual
// never throws on a length mismatch and no length is leaked via timing.
function tokenMatches(provided: string, expected: string): boolean {
	const a = createHash("sha256").update(provided).digest();
	const b = createHash("sha256").update(expected).digest();
	return timingSafeEqual(a, b);
}

// Require the exact `Bearer <token>` shape so a token containing the substring
// "Bearer " is not mangled the way `.replace("Bearer ", "")` would.
function parseBearer(auth: string): string | null {
	const match = /^Bearer (.+)$/.exec(auth);
	return match ? match[1] : null;
}

// Same bearer-token scheme as /api/metrics. Absent a configured token, no
// caller is authorized and error details are always withheld.
function isAuthorized(req: Request): boolean {
	if (!METRICS_TOKEN) return false;
	const auth = req.headers.get("authorization") ?? "";
	const token = parseBearer(auth);
	return token !== null && tokenMatches(token, METRICS_TOKEN);
}

export async function GET(req: Request) {
	const [mongo, redis] = await Promise.all([
		probe(async () => {
			await connectMongoDB();
			const db = mongoose.connection.db;
			if (!db) throw new Error("no active mongo connection");
			// Real round-trip: proves the cached connection is still alive.
			await db.admin().ping();
		}),
		probe(async () => {
			const pong = await Redis.ping();
			if (pong !== "PONG")
				throw new Error(`unexpected PING reply: ${pong}`);
		}),
	]);

	// Full detail to the server logs always — ops need the host:port to triage,
	// and this is the same signal we are withholding from anonymous callers.
	if (mongo.error) console.error(`[health] mongo probe down: ${mongo.error}`);
	if (redis.error) console.error(`[health] redis probe down: ${redis.error}`);

	const authorized = isAuthorized(req);
	const healthy = mongo.state === "ok" && redis.state === "ok";
	return NextResponse.json(
		{
			status: healthy ? "ok" : "degraded",
			// Wire contract kept flat ("ok" | "down") for the load balancer and
			// existing consumers; per-probe latency lives alongside it, and the
			// error reason only for an authorized (metrics-token) caller.
			checks: { mongo: mongo.state, redis: redis.state },
			details: {
				mongo: detail(mongo, authorized),
				redis: detail(redis, authorized),
			},
		},
		{
			status: healthy ? 200 : 503,
			headers: { "Cache-Control": "no-store" },
		},
	);
}
