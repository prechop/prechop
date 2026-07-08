import "server-only";
import type { NextRequest } from "next/server";
import { DB_NAME, isOriginAllowed } from "../constants";
import { Redis } from "../databases";
import { getClientIp } from "./clientIp";

const RATE_LIMIT_DISABLED =
	process.env.DISABLE_RATE_LIMIT === "1" ||
	process.env.DISABLE_RATE_LIMIT === "true";

interface RateLimitOptions {
	windowMs: number;
	maxRequests: number;
	keyGenerator?: (req: NextRequest | Request) => string;
}

export interface RateLimitResult {
	allowed: boolean;
	limit: number;
	remaining: number;
	retryAfterSeconds?: number;
}

export async function enforceRateLimit(
	req: NextRequest | Request,
	options: RateLimitOptions,
): Promise<RateLimitResult> {
	if (RATE_LIMIT_DISABLED) {
		return {
			allowed: true,
			limit: options.maxRequests,
			remaining: options.maxRequests,
		};
	}

	const { windowMs, keyGenerator } = options;
	let maxRequests = options.maxRequests;

	const origin = req.headers.get("origin");
	if (isOriginAllowed(origin || "")) maxRequests *= 2;

	const key = keyGenerator ? keyGenerator(req) : getClientIp(req);
	const rateLimitKey = `rate-limit:${DB_NAME}:${key}`;

	const current = await Redis.incr(rateLimitKey);
	if (current === 1) {
		await Redis.expire(rateLimitKey, Math.ceil(windowMs / 1000));
	}

	const remaining = Math.max(0, maxRequests - current);

	if (current > maxRequests) {
		const ttl = await Redis.ttl(rateLimitKey);
		return {
			allowed: false,
			limit: maxRequests,
			remaining: 0,
			retryAfterSeconds: ttl > 0 ? ttl : Math.ceil(windowMs / 1000),
		};
	}

	return { allowed: true, limit: maxRequests, remaining };
}

export function applyRateLimitHeaders(
	response: Response,
	result: RateLimitResult,
): Response {
	response.headers.set("X-RateLimit-Limit", String(result.limit));
	response.headers.set("X-RateLimit-Remaining", String(result.remaining));
	if (result.retryAfterSeconds !== undefined) {
		response.headers.set("Retry-After", String(result.retryAfterSeconds));
	}
	return response;
}
