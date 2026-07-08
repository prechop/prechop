import crypto from "node:crypto";
import { ENCRYPTION_KEY } from "./environments";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Lazily resolve the key so a missing ENCRYPTION_KEY only fails when PII is
// actually encrypted, not at module import (which would break every route).
let cachedKey: Buffer | null = null;
function getKey(): Buffer {
	if (cachedKey) return cachedKey;
	if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
		throw new Error(
			"ENCRYPTION_KEY must be a 32-byte hex string (64 characters)",
		);
	}
	cachedKey = Buffer.from(ENCRYPTION_KEY, "hex");
	return cachedKey;
}

/**
 * Encrypts sensitive PII (phone numbers, bank account numbers) before storing.
 * Output format: `iv:authTag:ciphertext` (all hex).
 */
export function encrypt(plaintext: string): string {
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();
	return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
	const parts = ciphertext.split(":");
	if (parts.length !== 3) throw new Error("Invalid ciphertext format");
	const [ivHex, authTagHex, encryptedHex] = parts;
	const iv = Buffer.from(ivHex, "hex");
	const authTag = Buffer.from(authTagHex, "hex");
	const encrypted = Buffer.from(encryptedHex, "hex");
	if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
		throw new Error("Invalid ciphertext components");
	}
	const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
	decipher.setAuthTag(authTag);
	const decrypted = Buffer.concat([
		decipher.update(encrypted),
		decipher.final(),
	]);
	return decrypted.toString("utf8");
}

/** Best-effort decrypt: returns the input unchanged if it isn't ciphertext. */
export function tryDecrypt(value: string | undefined | null): string {
	if (!value) return "";
	try {
		return decrypt(value);
	} catch {
		return value;
	}
}

/**
 * Deterministic keyed digest of a phone number. Encrypted `phone` values are
 * non-deterministic (random IV) so they cannot be uniquely indexed; we store a
 * `phoneHash` alongside and put the unique index on that instead.
 */
export function phoneHash(phone: string): string {
	return crypto
		.createHmac("sha256", getKey())
		.update(phone.trim())
		.digest("hex");
}

/**
 * One-way device fingerprint (User-Agent + IP). Never decrypted — used only for
 * equality comparison when auditing refresh-token reuse.
 */
export function hashFingerprint(userAgent: string, ip: string): string {
	return crypto
		.createHash("sha256")
		.update(`${userAgent}|${ip}`)
		.digest("hex");
}
