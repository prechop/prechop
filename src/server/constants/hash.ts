import { createHash } from "node:crypto";

/**
 * SHA-256 hex digest. Used for non-secret deterministic digests (session ids,
 * idempotency keys) where a fast, stable, one-way value is needed.
 */
export default function hash(content: string): string {
	return createHash("sha256").update(content, "utf8").digest("hex");
}
