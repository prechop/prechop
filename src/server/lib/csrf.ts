import "server-only";
import type { NextRequest } from "next/server";
import { isOriginAllowed } from "../constants";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Origin/Referer-based CSRF guard. Same-Site cookies block most CSRF vectors;
 * this adds a server-side origin check so a request from an attacker page can
 * never mutate state even if the cookie is somehow attached.
 *
 * Returns `null` on pass, or a reason string on reject (mapped to 403).
 */
export function csrfReject(req: NextRequest | Request): string | null {
	if (!UNSAFE_METHODS.has(req.method)) return null;

	const origin = req.headers.get("origin");
	if (origin) {
		if (isOriginAllowed(origin)) return null;
		return "Origin not allowed";
	}

	const referer = req.headers.get("referer");
	if (referer) {
		try {
			const refOrigin = new URL(referer).origin;
			if (isOriginAllowed(refOrigin)) return null;
			return "Referer not allowed";
		} catch {
			return "Malformed Referer";
		}
	}

	return "Missing Origin and Referer";
}
