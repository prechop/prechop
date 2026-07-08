// Vendor profile completeness (0–100). A vendor cannot appear on the
// marketplace until this reaches the configured threshold (default 100).

export interface CompletenessInput {
	isPhoneVerified: boolean;
	hasProfileImage: boolean;
	hasMenuCategory: boolean;
	menuItemCount: number;
	hasTimetableEntry: boolean;
	hasBankDetails: boolean;
}

const WEIGHTS = {
	phoneVerified: 10,
	profileImage: 15,
	menuCategory: 10,
	menuItems: 25,
	timetable: 15,
	bankDetails: 25,
} as const;

const MIN_MENU_ITEMS_REQUIRED = 3;

export function calculateCompleteness(input: CompletenessInput): number {
	let score = 0;
	if (input.isPhoneVerified) score += WEIGHTS.phoneVerified;
	if (input.hasProfileImage) score += WEIGHTS.profileImage;
	if (input.hasMenuCategory) score += WEIGHTS.menuCategory;
	if (input.menuItemCount >= MIN_MENU_ITEMS_REQUIRED)
		score += WEIGHTS.menuItems;
	if (input.hasTimetableEntry) score += WEIGHTS.timetable;
	if (input.hasBankDetails) score += WEIGHTS.bankDetails;
	return score;
}
