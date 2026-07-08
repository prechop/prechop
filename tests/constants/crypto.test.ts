import { describe, expect, it } from "vitest";
import {
	decrypt,
	encrypt,
	hashFingerprint,
	phoneHash,
	tryDecrypt,
} from "@/server/constants/crypto";

describe("encrypt/decrypt", () => {
	it("round-trips plaintext", () => {
		const plain = "08012345678";
		const cipher = encrypt(plain);
		expect(cipher).not.toBe(plain);
		expect(cipher.split(":")).toHaveLength(3);
		expect(decrypt(cipher)).toBe(plain);
	});

	it("produces a different ciphertext each call (random IV)", () => {
		expect(encrypt("hello")).not.toBe(encrypt("hello"));
	});

	it("round-trips unicode", () => {
		const plain = "Adé Chukwu — ₦";
		expect(decrypt(encrypt(plain))).toBe(plain);
	});

	it("rejects malformed ciphertext", () => {
		expect(() => decrypt("not-valid")).toThrow("Invalid ciphertext format");
		expect(() => decrypt("aa:bb:cc")).toThrow();
	});

	it("rejects tampered ciphertext (auth tag mismatch)", () => {
		const cipher = encrypt("secret");
		const [iv, tag, data] = cipher.split(":");
		const flipped = data.startsWith("0") ? `1${data.slice(1)}` : `0${data.slice(1)}`;
		expect(() => decrypt(`${iv}:${tag}:${flipped}`)).toThrow();
	});
});

describe("tryDecrypt", () => {
	it("decrypts valid ciphertext", () => {
		expect(tryDecrypt(encrypt("0803"))).toBe("0803");
	});

	it("returns the input unchanged on garbage", () => {
		expect(tryDecrypt("plainstring")).toBe("plainstring");
	});

	it("returns empty string for null/undefined/empty", () => {
		expect(tryDecrypt(null)).toBe("");
		expect(tryDecrypt(undefined)).toBe("");
		expect(tryDecrypt("")).toBe("");
	});
});

describe("phoneHash", () => {
	it("is deterministic", () => {
		expect(phoneHash("08012345678")).toBe(phoneHash("08012345678"));
	});

	it("trims before hashing", () => {
		expect(phoneHash("  08012345678  ")).toBe(phoneHash("08012345678"));
	});

	it("differs for different inputs", () => {
		expect(phoneHash("08012345678")).not.toBe(phoneHash("08012345679"));
	});

	it("returns a 64-char hex digest", () => {
		expect(phoneHash("08012345678")).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe("hashFingerprint", () => {
	it("is deterministic for the same UA + IP", () => {
		expect(hashFingerprint("UA", "1.2.3.4")).toBe(
			hashFingerprint("UA", "1.2.3.4"),
		);
	});

	it("differs when UA or IP differ", () => {
		expect(hashFingerprint("UA", "1.2.3.4")).not.toBe(
			hashFingerprint("UA", "1.2.3.5"),
		);
		expect(hashFingerprint("UA", "1.2.3.4")).not.toBe(
			hashFingerprint("UB", "1.2.3.4"),
		);
	});
});
