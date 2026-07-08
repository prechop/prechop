import { NextResponse } from "next/server";
import { connectMongoDB, Redis } from "@/server/databases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liveness + readiness: Mongo and Redis must both answer. 200 healthy, 503 not.
export async function GET() {
	const checks: Record<string, "ok" | "down"> = {
		mongo: "down",
		redis: "down",
	};
	try {
		await connectMongoDB();
		checks.mongo = "ok";
	} catch {
		checks.mongo = "down";
	}
	try {
		const pong = await Redis.ping();
		checks.redis = pong === "PONG" ? "ok" : "down";
	} catch {
		checks.redis = "down";
	}
	const healthy = checks.mongo === "ok" && checks.redis === "ok";
	return NextResponse.json(
		{ status: healthy ? "ok" : "degraded", checks },
		{ status: healthy ? 200 : 503 },
	);
}
