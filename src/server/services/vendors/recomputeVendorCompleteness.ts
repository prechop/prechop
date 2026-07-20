import { ErrVendorNotFound } from "@/server/constants";
import { calculateCompleteness } from "@/server/helpers/completeness";
import {
	countMenuItemsByVendorDB,
	getUserByIdDB,
	getVendorProfileByIdDB,
	hasAnyTimetableEntryDB,
	setVendorCompletenessDB,
	type VendorStatus,
} from "@/server/models";

/**
 * Recompute a vendor's profile completeness from its current onboarding state.
 *
 * NOTE: completeness no longer auto-activates a vendor. A complete profile only
 * unlocks the "Submit for review" action; going ACTIVE requires explicit admin
 * approval (see `submitVendorForReview` + the admin onboarding service).
 */
export async function recomputeVendorCompleteness({
	vendorId,
	userId,
}: {
	vendorId: string;
	userId: string;
}): Promise<{ profileCompleteness: number; status: VendorStatus }> {
	const vendor = await getVendorProfileByIdDB({ id: vendorId });
	if (!vendor) throw ErrVendorNotFound;

	const [user, menuItemCount, hasTimetableEntry] = await Promise.all([
		getUserByIdDB({ id: userId }),
		countMenuItemsByVendorDB({ vendorId }),
		hasAnyTimetableEntryDB({ vendorId }),
	]);
	if (!user) throw ErrVendorNotFound;

	const profileCompleteness = calculateCompleteness({
		hasProfileImage: !!vendor.profileImageUrl,
		hasMenuCategory: (vendor.categories?.length ?? 0) > 0,
		menuItemCount,
		hasTimetableEntry,
		hasBankDetails: !!vendor.paystackSubaccountCode,
	});

	await setVendorCompletenessDB({ id: vendorId, profileCompleteness });

	return { profileCompleteness, status: vendor.status };
}
