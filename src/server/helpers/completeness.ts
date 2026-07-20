// Vendor profile completeness (0–100). A vendor cannot appear on the
// marketplace until this reaches the configured threshold (default 100).

export interface CompletenessInput {
	hasProfileImage: boolean;
	hasMenuCategory: boolean;
	menuItemCount: number;
	hasTimetableEntry: boolean;
	hasBankDetails: boolean;
}

const WEIGHTS = {
	profileImage: 15,
	menuCategory: 10,
	menuItems: 25,
	timetable: 15,
	bankDetails: 35,
} as const;

const MIN_MENU_ITEMS_REQUIRED = 3;

export function calculateCompleteness(input: CompletenessInput): number {
	let score = 0;
	if (input.hasProfileImage) score += WEIGHTS.profileImage;
	if (input.hasMenuCategory) score += WEIGHTS.menuCategory;
	if (input.menuItemCount >= MIN_MENU_ITEMS_REQUIRED)
		score += WEIGHTS.menuItems;
	if (input.hasTimetableEntry) score += WEIGHTS.timetable;
	if (input.hasBankDetails) score += WEIGHTS.bankDetails;
	return score;
}

// The onboarding checklist — the steps a vendor completes to submit their
// application for review. This is deliberately SEPARATE from the marketplace
// completeness score above: that score also rewards menu items and timetable
// entries, but those live behind the `assertActiveVendor` gate and cannot be
// added until an admin approves the vendor. Gating submission on the full 100%
// score would deadlock every applicant at ~60%. Submission therefore requires
// only the steps an applicant can actually perform pre-approval.
export interface OnboardingChecklistInput {
	hasBusinessIdentity: boolean;
	hasCategory: boolean;
	hasLocation: boolean;
	hasBankDetails: boolean;
	hasProfileImage: boolean;
}

export interface OnboardingChecklist {
	identity: boolean;
	categories: boolean;
	location: boolean;
	bank: boolean;
	image: boolean;
	/** True once every step above is satisfied — the submit todo unlocks. */
	complete: boolean;
	/** Keys of the steps still outstanding (for messaging). */
	missing: string[];
}

export function onboardingChecklist(
	input: OnboardingChecklistInput,
): OnboardingChecklist {
	const steps = {
		identity: input.hasBusinessIdentity,
		categories: input.hasCategory,
		location: input.hasLocation,
		bank: input.hasBankDetails,
		image: input.hasProfileImage,
	};
	const missing = Object.entries(steps)
		.filter(([, done]) => !done)
		.map(([key]) => key);
	return { ...steps, complete: missing.length === 0, missing };
}
