import { ErrVendorNotFound } from "@/server/constants";
import { calculateCompleteness } from "@/server/helpers/completeness";
import {
	countMenuItemsByVendorDB,
	getUserByIdDB,
	getVendorProfileByIdDB,
	hasAnyTimetableEntryDB,
	setVendorCompletenessDB,
	setVendorStatusDB,
	VendorStatus,
} from "@/server/models";
import { resendProvider } from "@/server/providers";
import { getSiteConfigs } from "@/server/services/siteConfigs";

/**
 * Recompute a vendor's profile completeness from its current onboarding state.
 * When the score meets the configured threshold and the vendor is still
 * INCOMPLETE, promote it to ACTIVE and send the welcome email.
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

	const profileCompleteness = calculateCompleteness({
		isPhoneVerified: user?.isPhoneVerified ?? false,
		hasProfileImage: !!vendor.profileImageUrl,
		hasMenuCategory: (vendor.categories?.length ?? 0) > 0,
		menuItemCount,
		hasTimetableEntry,
		hasBankDetails: !!vendor.paystackSubaccountCode,
	});

	await setVendorCompletenessDB({ id: vendorId, profileCompleteness });

	let status = vendor.status;
	const { profileCompletenessRequired } = await getSiteConfigs();
	if (
		profileCompleteness >= profileCompletenessRequired &&
		vendor.status === VendorStatus.INCOMPLETE
	) {
		await setVendorStatusDB({ id: vendorId, status: VendorStatus.ACTIVE });
		status = VendorStatus.ACTIVE;
		await resendProvider.sendVendorWelcome(
			vendor.email,
			vendor.businessName ?? "there",
		);
	}

	return { profileCompleteness, status };
}
