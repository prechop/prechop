import "server-only";
import type { NextRequest } from "next/server";
import { connectMongoDB } from "../databases";
import { restResponseTimeHistogram } from "../metrics";
import { assertAdministrator, verifyAuthToken } from "./auth";
import { setAuthCookies } from "./cookies";
import { csrfReject } from "./csrf";
import {
	applyRateLimitHeaders,
	enforceRateLimit,
	type RateLimitResult,
} from "./rateLimit";
import { fail, handleError } from "./response";

const DEFAULT_RATE_LIMIT = { windowMs: 60 * 1000, maxRequests: 100 };

interface HandlerOptions {
	route: string;
	rateLimit?: { windowMs: number; maxRequests: number } | false;
	/**
	 * Skip Origin/Referer CSRF validation. Only for routes that legitimately
	 * accept non-browser callers (the Paystack webhook).
	 */
	csrf?: false;
}

export type RouteHandler<TCtx = unknown> = (args: {
	req: NextRequest;
	context: TCtx;
}) => Promise<Response> | Response;

/**
 * Wraps a Next.js route handler with: CSRF gate, rate limiting, MongoDB
 * readiness, Prometheus histogram observation, and consistent error responses.
 */
export function withApiHandler<TCtx = unknown>(
	options: HandlerOptions,
	handler: RouteHandler<TCtx>,
) {
	const rl = options.rateLimit ?? DEFAULT_RATE_LIMIT;

	return async (req: NextRequest, context: TCtx): Promise<Response> => {
		const startNs = process.hrtime.bigint();
		let rlResult: RateLimitResult | null = null;

		try {
			if (options.csrf !== false) {
				const reason = csrfReject(req);
				if (reason) {
					const res = fail(403, reason);
					observe(req, res.status, options.route, startNs);
					return res;
				}
			}

			if (rl) {
				rlResult = await enforceRateLimit(req, rl);
				if (!rlResult.allowed) {
					const res = fail(
						429,
						"Too many requests, please try again later.",
					);
					return applyRateLimitHeaders(res, rlResult);
				}
			}

			await connectMongoDB();

			if (options.route.startsWith("/api/admin")) {
				const auth = await verifyAuthToken(req);
				assertAdministrator(auth);
				if (auth.refreshed) await setAuthCookies(auth.token);
			}

			const response = await handler({ req, context });
			if (rlResult) applyRateLimitHeaders(response, rlResult);

			observe(req, response.status, options.route, startNs);
			return response;
		} catch (error) {
			const res = handleError(error);
			if (rlResult) applyRateLimitHeaders(res, rlResult);
			observe(req, res.status, options.route, startNs);
			return res;
		}
	};
}

function observe(
	req: NextRequest,
	status: number,
	route: string,
	startNs: bigint,
): void {
	try {
		const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
		restResponseTimeHistogram.observe(
			{ method: req.method, route, status_code: status },
			elapsedMs,
		);
	} catch {
		// metrics must never break a request
	}
}
