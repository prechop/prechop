import { describe, expect, it } from "vitest";
import {
	generateOrderNumber,
	generatePaystackRef,
	generateShareableToken,
} from "@/server/constants/orderNumber";

describe("generateOrderNumber", () => {
	it("matches PCH-YYYY-XXXXXX", () => {
		const year = new Date().getFullYear();
		const on = generateOrderNumber();
		expect(on).toMatch(/^PCH-\d{4}-[0-9A-F]{6}$/);
		expect(on.startsWith(`PCH-${year}-`)).toBe(true);
	});

	it("is non-sequential / varied across calls", () => {
		const set = new Set(
			Array.from({ length: 200 }, () => generateOrderNumber()),
		);
		// Overwhelmingly unique; allow no strict 100% but expect near-total.
		expect(set.size).toBeGreaterThan(190);
	});
});

describe("generateShareableToken", () => {
	it("is 24 hex chars and unique across many calls", () => {
		const tokens = Array.from({ length: 1000 }, () =>
			generateShareableToken(),
		);
		for (const t of tokens) expect(t).toMatch(/^[0-9a-f]{24}$/);
		expect(new Set(tokens).size).toBe(tokens.length);
	});
});

describe("generatePaystackRef", () => {
	it("is prefixed and hex", () => {
		expect(generatePaystackRef()).toMatch(/^PCH-[0-9A-F]{16}$/);
	});

	it("is unique across calls", () => {
		const refs = Array.from({ length: 500 }, () => generatePaystackRef());
		expect(new Set(refs).size).toBe(refs.length);
	});
});
