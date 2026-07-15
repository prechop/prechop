import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { IS_PROD, METRICS_ENABLED, METRICS_TOKEN } from "@/server/constants";
import { fail, withApiHandler } from "@/server/lib";
import { renderMetrics } from "@/server/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// Prometheus scrape endpoint. Always guarded by a bearer token in production:
// metrics leak route names, latencies and order volumes. METRICS_ENABLED=1 is a
// LOCAL-ONLY bypass for token-free scraping and is ignored when IS_PROD, so no
// env-var combination can expose this endpoint unauthenticated in production.
export const GET = withApiHandler(
	{ route: "/api/metrics", rateLimit: false },
	async ({ req }: { req: NextRequest }) => {
		if (IS_PROD || !METRICS_ENABLED) {
			const auth = req.headers.get("authorization") ?? "";
			const token = parseBearer(auth);
			if (
				!METRICS_TOKEN ||
				!token ||
				!tokenMatches(token, METRICS_TOKEN)
			) {
				return fail(401, "Unauthorized");
			}
		}
		const { contentType, body } = await renderMetrics();
		return new Response(body, {
			status: 200,
			headers: { "Content-Type": contentType },
		});
	},
);
