import crypto from "node:crypto";
import { ENCRYPTION_KEY, JWT_ACCESS_TOKEN_SECRET } from "./environments";
import { validationError } from "./errors";
import hashToken from "./hashToken";

function handoverSecret(): string {
	const secret = ENCRYPTION_KEY || JWT_ACCESS_TOKEN_SECRET;
	if (!secret) {
		throw validationError("Confirmation credentials are unavailable.");
	}
	return secret;
}

export function deriveHandoverCredential(order: {
	_id: string;
	orderNumber: string;
	buyerId: string;
	vendorId: string;
}) {
	const base = `${order._id}:${order.orderNumber}:${order.buyerId}:${order.vendorId}`;
	const qrToken = crypto
		.createHmac("sha256", handoverSecret())
		.update(`qr:${base}`)
		.digest("hex");
	const pinSeed = crypto
		.createHmac("sha256", handoverSecret())
		.update(`pin:${base}`)
		.digest("hex");
	const pin = String(
		Number.parseInt(pinSeed.slice(0, 12), 16) % 1_000_000,
	).padStart(6, "0");
	return {
		qrToken,
		pin,
		qrTokenHash: hashToken(qrToken),
		pinHash: hashToken(pin),
	};
}
