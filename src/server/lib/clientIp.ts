import "server-only";
import type { NextRequest } from "next/server";
import { NODE_ENV, TRUSTED_PROXY } from "../constants/environments";

// `cf-connecting-ip`, `x-real-ip` and `x-forwarded-for` are ALL client-supplied
// and trivially forgeable unless a trusted edge (CDN / load balancer) rewrites
// them on the way in. Because `enforceRateLimit` keys on this value, honoring an
// attacker-controlled header lets a single client mint unlimited rate-limit
// buckets by rotating one header — defeating every IP-scoped throttle, most
// dangerously the OTP-request limiter (SMS-cost amplification).
//
// So forwarded headers are honored ONLY behind TRUSTED_PROXY=1. Untrusted, we
// ignore every one of them and fall back to the socket peer address (or, when
// the runtime does not expose one, a single shared "unknown" bucket) — spoofed
// traffic then collapses into one bucket instead of fanning out into unlimited
// ones. That is fail-closed: over-throttling an untrusted deployment is far
// better than handing out an SMS-bomb amplifier. Set TRUSTED_PROXY=1 in prod so
// clients are bucketed individually again (boot warns when it is unset).
let warnedAboutUntrustedProxy = false;
function warnIfUntrustedProxy(): void {
	if (warnedAboutUntrustedProxy) return;
	warnedAboutUntrustedProxy = true;
	if (NODE_ENV === "production" && !TRUSTED_PROXY) {
		console.warn(
			"[clientIp] TRUSTED_PROXY is not set. Forwarded-IP headers are ignored (they are client-supplied and spoofable); untrusted traffic shares one rate-limit bucket. Set TRUSTED_PROXY=1 behind a trusted edge for per-client limiting.",
		);
	}
}

// Best-effort socket peer address. Next 16 route handlers do not expose the raw
// socket, so this is usually undefined and we fall back to "unknown"; a custom
// server or middleware that sets `req.ip` will still be honored.
function peerAddress(req: NextRequest | Request): string {
	const ip = (req as { ip?: string }).ip?.trim();
	return ip || "unknown";
}

export function getClientIp(req: NextRequest | Request): string {
	const headers = req.headers;

	// Untrusted: forwarded headers are attacker-controlled — ignore all of them.
	if (!TRUSTED_PROXY) {
		warnIfUntrustedProxy();
		return peerAddress(req);
	}

	// Behind a trusted edge these headers are authoritative.
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
		// Last hop = the address our trusted edge observed and appended.
		if (parts.length > 0) return parts[parts.length - 1] ?? "unknown";
	}

	return peerAddress(req);
}

export function getUserAgent(req: NextRequest | Request): string {
	return req.headers.get("user-agent") ?? "unknown";
}
