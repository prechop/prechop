import type { NextRequest } from "next/server";
import { METRICS_ENABLED, METRICS_TOKEN } from "@/server/constants";
import { fail, withApiHandler } from "@/server/lib";
import { renderMetrics } from "@/server/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prometheus scrape endpoint. Guarded by a bearer token in production; a dev
// bypass (METRICS_ENABLED=1) allows local scraping without a token.
export const GET = withApiHandler(
	{ route: "/api/metrics", rateLimit: false },
	async ({ req }: { req: NextRequest }) => {
		if (!METRICS_ENABLED) {
			const auth = req.headers.get("authorization") ?? "";
			const token = auth.replace("Bearer ", "");
			if (!METRICS_TOKEN || token !== METRICS_TOKEN) {
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
