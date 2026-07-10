import { describe, expect, it } from "vitest";
import {
	type CompletenessInput,
	calculateCompleteness,
	type OnboardingChecklistInput,
	onboardingChecklist,
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
		expect(calculateCompleteness({ ...empty, isPhoneVerified: true })).toBe(
			10,
		);
		expect(calculateCompleteness({ ...empty, hasProfileImage: true })).toBe(
			15,
		);
		expect(calculateCompleteness({ ...empty, hasMenuCategory: true })).toBe(
			10,
		);
		expect(
			calculateCompleteness({ ...empty, hasTimetableEntry: true }),
		).toBe(15);
		expect(calculateCompleteness({ ...empty, hasBankDetails: true })).toBe(
			25,
		);
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

const emptyChecklist: OnboardingChecklistInput = {
	isPhoneVerified: false,
	hasBusinessIdentity: false,
	hasCategory: false,
	hasLocation: false,
	hasBankDetails: false,
	hasProfileImage: false,
};

const fullChecklist: OnboardingChecklistInput = {
	isPhoneVerified: true,
	hasBusinessIdentity: true,
	hasCategory: true,
	hasLocation: true,
	hasBankDetails: true,
	hasProfileImage: true,
};

describe("onboardingChecklist", () => {
	it("is incomplete and lists every step for an empty profile", () => {
		const res = onboardingChecklist(emptyChecklist);
		expect(res.complete).toBe(false);
		expect(res.missing).toEqual([
			"phone",
			"identity",
			"categories",
			"location",
			"bank",
			"image",
		]);
	});

	it("is complete with no missing steps when every step is done", () => {
		const res = onboardingChecklist(fullChecklist);
		expect(res.complete).toBe(true);
		expect(res.missing).toEqual([]);
		expect(res).toMatchObject({
			phone: true,
			identity: true,
			categories: true,
			location: true,
			bank: true,
			image: true,
		});
	});

	it("does not depend on menu items or timetable (unlike completeness)", () => {
		// The whole point of the checklist: it can be satisfied without the
		// active-vendor-gated tasks, so an applicant is never deadlocked.
		const res = onboardingChecklist(fullChecklist);
		expect(res.complete).toBe(true);
	});

	it("reports exactly the one missing step when a single item is absent", () => {
		expect(
			onboardingChecklist({ ...fullChecklist, hasLocation: false })
				.missing,
		).toEqual(["location"]);
		expect(
			onboardingChecklist({ ...fullChecklist, hasBankDetails: false })
				.missing,
		).toEqual(["bank"]);
		expect(
			onboardingChecklist({ ...fullChecklist, isPhoneVerified: false })
				.complete,
		).toBe(false);
	});
});
