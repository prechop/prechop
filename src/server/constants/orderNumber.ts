import crypto from "node:crypto";

/**
 * Human-readable order number: `PCH-2026-A3F92K`. Not sequential — cannot be
 * used to estimate order volume or guess adjacent orders.
 */
export function generateOrderNumber(): string {
	const year = new Date().getFullYear();
	const random = crypto
		.randomBytes(4)
		.toString("hex")
		.toUpperCase()
		.slice(0, 6);
	return `PCH-${year}-${random}`;
}

/** Opaque share token for a public daily-order link (`/o/<token>`). */
export function generateShareableToken(): string {
	return crypto.randomBytes(12).toString("hex");
}

/** Paystack transaction reference. */
export function generatePaystackRef(): string {
	return `PCH-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
}
