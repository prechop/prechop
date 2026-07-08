import { createHash } from "node:crypto";

/**
 * One-way hash for unguessable single-use / lookup tokens (refresh tokens,
 * share tokens). The input is already high-entropy `crypto.randomBytes`, so
 * unsalted SHA-256 is appropriate: it is deterministic (needed for lookup by
 * hash) and fast.
 */
export default function hashToken(token: string): string {
	return createHash("sha256").update(token, "utf8").digest("hex");
}
