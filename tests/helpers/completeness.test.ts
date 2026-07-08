import { describe, expect, it } from "vitest";
import {
	calculateCompleteness,
	type CompletenessInput,
} from "@/server/helpers/completeness";

const empty: CompletenessInput = {
	isPhoneVerified: false,
	hasProfileImage: false,
	hasMenuCategory: false,
	menuItemCount: 0,
	hasTimetableEntry: false,
	hasBankDetails: false,
};

describe("calculateCompleteness", () => {
	it("is 0 for a fully empty profile", () => {
		expect(calculateCompleteness(empty)).toBe(0);
	});

	it("is 100 for a fully complete profile (>=3 menu items)", () => {
		expect(
			calculateCompleteness({
				isPhoneVerified: true,
				hasProfileImage: true,
				hasMenuCategory: true,
				menuItemCount: 3,
				hasTimetableEntry: true,
				hasBankDetails: true,
			}),
		).toBe(100);
	});

	it("weights each field correctly in isolation", () => {
		expect(
			calculateCompleteness({ ...empty, isPhoneVerified: true }),
		).toBe(10);
		expect(
			calculateCompleteness({ ...empty, hasProfileImage: true }),
		).toBe(15);
		expect(
			calculateCompleteness({ ...empty, hasMenuCategory: true }),
		).toBe(10);
		expect(
			calculateCompleteness({ ...empty, hasTimetableEntry: true }),
		).toBe(15);
		expect(
			calculateCompleteness({ ...empty, hasBankDetails: true }),
		).toBe(25);
	});

	it("only awards menu-item weight at the 3-item threshold", () => {
		expect(calculateCompleteness({ ...empty, menuItemCount: 2 })).toBe(0);
		expect(calculateCompleteness({ ...empty, menuItemCount: 3 })).toBe(25);
		expect(calculateCompleteness({ ...empty, menuItemCount: 10 })).toBe(25);
	});

	it("sums a partial profile", () => {
		expect(
			calculateCompleteness({
				...empty,
				isPhoneVerified: true,
				hasBankDetails: true,
			}),
		).toBe(35);
	});
});
