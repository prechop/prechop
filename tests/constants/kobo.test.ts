import { describe, expect, it } from "vitest";
import {
	formatKobo,
	koboToNaira,
	nairaToKobo,
	sumKobo,
} from "@/server/constants/kobo";

describe("nairaToKobo", () => {
	it("converts whole naira to integer kobo", () => {
		expect(nairaToKobo(2500)).toBe(250000);
		expect(nairaToKobo(0)).toBe(0);
	});

	it("rounds fractional naira to the nearest kobo", () => {
		expect(nairaToKobo(2500.5)).toBe(250050);
		expect(nairaToKobo(0.005)).toBe(1); // rounds up
		expect(nairaToKobo(0.004)).toBe(0); // rounds down
	});

	it("always returns an integer", () => {
		expect(Number.isInteger(nairaToKobo(19.99))).toBe(true);
	});

	it("rejects negative and non-finite amounts", () => {
		expect(() => nairaToKobo(-1)).toThrow("Invalid Naira amount");
		expect(() => nairaToKobo(Number.NaN)).toThrow("Invalid Naira amount");
		expect(() => nairaToKobo(Number.POSITIVE_INFINITY)).toThrow();
	});
});

describe("koboToNaira", () => {
	it("converts integer kobo to naira", () => {
		expect(koboToNaira(250000)).toBe(2500);
		expect(koboToNaira(250050)).toBe(2500.5);
		expect(koboToNaira(0)).toBe(0);
	});

	it("rejects non-integer or negative kobo", () => {
		expect(() => koboToNaira(1.5)).toThrow("Invalid kobo amount");
		expect(() => koboToNaira(-100)).toThrow("Invalid kobo amount");
	});
});

describe("formatKobo", () => {
	it("formats whole naira without decimals", () => {
		expect(formatKobo(250000)).toBe("₦2,500");
	});

	it("formats with two decimals when there is a kobo remainder", () => {
		expect(formatKobo(250050)).toBe("₦2,500.50");
	});

	it("formats zero", () => {
		expect(formatKobo(0)).toBe("₦0");
	});
});

describe("sumKobo", () => {
	it("sums integer amounts", () => {
		expect(sumKobo(100, 200, 300)).toBe(600);
		expect(sumKobo()).toBe(0);
	});

	it("throws on any non-integer amount", () => {
		expect(() => sumKobo(100, 1.5)).toThrow(
			"All kobo amounts must be integers",
		);
	});
});
