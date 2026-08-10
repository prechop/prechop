import { AppError, ErrTryAgain, VENDORS_GROUP } from "@/server/constants";
import {
	closeActiveDailyOrdersByVendorDB,
	closeVendorProfileDB,
	getUserByIdDB,
	removeUserFromGroupDB,
} from "@/server/models";
import {
	describeAccountObligations,
	getAccountObligations,
} from "../accountObligations";
import { recordAudit } from "../audit";
import { bumpPermVersion, getBuiltInGroupId } from "../iam";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";
import { verifyVendorSecurityPinForSensitiveAction } from "./securityOnboarding";

export const CLOSE_VENDOR_CONFIRMATION = "CLOSE MY VENDOR PROFILE";

export async function closeVendorProfile({
	userId,
	confirmation,
	securityPin,
}: {
	userId: string;
	confirmation: string;
	securityPin?: string;
}) {
	if (confirmation !== CLOSE_VENDOR_CONFIRMATION) {
		throw new AppError(
			`Type ${CLOSE_VENDOR_CONFIRMATION} to confirm.`,
			400,
			"CLOSE_VENDOR_CONFIRMATION_REQUIRED",
		);
	}

	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);
	if (vendor.securityPinSet) {
		if (!securityPin?.trim()) {
			throw new AppError(
				"Enter your vendor security PIN to continue.",
				403,
				"VENDOR_SECURITY_VERIFICATION_REQUIRED",
			);
		}
		await verifyVendorSecurityPinForSensitiveAction({
			userId,
			pin: securityPin.trim(),
		});
	}

	const obligations = await getAccountObligations({ vendorId });
	if (obligations.hasOutstandingObligations) {
		throw new AppError(
			`Resolve these vendor obligations first: ${describeAccountObligations(obligations)}.`,
			409,
			"VENDOR_CLOSURE_BLOCKED",
		);
	}

	const user = await getUserByIdDB({ id: userId });
	if (!user) throw ErrTryAgain;
	const vendorsGroupId = await getBuiltInGroupId(VENDORS_GROUP);

	// Closing the profile removes it from every public vendor lookup. Listings
	// are then closed in place so historical orders keep their references.
	if (!(await closeVendorProfileDB({ id: vendorId }))) throw ErrTryAgain;
	await closeActiveDailyOrdersByVendorDB({ vendorId });

	if (vendorsGroupId) {
		if (
			!(await removeUserFromGroupDB({
				id: userId,
				groupId: vendorsGroupId,
			}))
		)
			throw ErrTryAgain;
		await bumpPermVersion();
	}

	recordAudit({
		userId,
		role: VENDORS_GROUP,
		action: "VENDOR_PROFILE_CLOSE",
		resourceType: "vendorProfiles",
		resourceId: vendorId,
		previousState: {
			status: vendor.status,
			isOpenForOrders: vendor.isOpenForOrders,
		},
		newState: { closed: true, buyerAccountPreserved: true },
	});

	return {
		vendorProfileClosed: true,
		buyerAccountActive: user.isActive,
	};
}
