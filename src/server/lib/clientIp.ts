import "server-only";
import type { NextRequest } from "next/server";
import { NODE_ENV, TRUSTED_PROXY } from "../constants/environments";

// Forwarded-IP headers are client-supplied unless a trusted edge overwrites
// them. With TRUSTED_PROXY=1 we take the last XFF hop (closest to the edge);
// otherwise we take the first hop (per-attacker bucketing) and warn once.
let warnedAboutUntrustedProxy = false;
function warnIfUntrustedProxy(): void {
	if (warnedAboutUntrustedProxy) return;
	warnedAboutUntrustedProxy = true;
	if (NODE_ENV === "production" && !TRUSTED_PROXY) {
		console.warn(
			"[clientIp] TRUSTED_PROXY is not set. Forwarded-IP headers are honored without trust verification — rate limits and IP binding can be spoofed.",
		);
	}
}

export function getClientIp(req: NextRequest | Request): string {
	const headers = req.headers;
	const cf = headers.get("cf-connecting-ip")?.trim();
	if (cf) return cf;
	const realIp = headers.get("x-real-ip")?.trim();
	if (realIp) return realIp;

	const xff = headers.get("x-forwarded-for");
	if (xff) {
		const parts = xff
			.split(",")
			.map((p) => p.trim())
			.filter(Boolean);
		if (parts.length > 0) {
			if (TRUSTED_PROXY) return parts[parts.length - 1] ?? "unknown";
			warnIfUntrustedProxy();
			return parts[0] ?? "unknown";
		}
	}

	return "unknown";
}

export function getUserAgent(req: NextRequest | Request): string {
	return req.headers.get("user-agent") ?? "unknown";
}
