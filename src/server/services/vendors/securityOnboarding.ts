import bcrypt from "bcrypt";
import { AppError, ErrVendorNotFound } from "@/server/constants";
import {
	updateVendorSecurityOnboardingDB,
	VendorStatus,
} from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";

export const ErrVendorSecurityVerificationRequired = new AppError(
	"Complete security verification before changing payout details.",
	403,
	"VENDOR_SECURITY_VERIFICATION_REQUIRED",
);

export async function updateSecurityOnboarding({
	userId,
	action,
	pin,
}: {
	userId: string;
	action: "DISMISS" | "COMPLETE";
	pin?: string;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const securityPinHash =
		action === "COMPLETE" && pin ? await bcrypt.hash(pin, 12) : undefined;
	const updated = await updateVendorSecurityOnboardingDB({
		id: vendorIdOf(vendor),
		completed: action === "COMPLETE",
		securityPinHash,
	});
	if (!updated) throw ErrVendorNotFound;
	return updated;
}

export function assertVendorSecurityVerifiedForSensitiveAction(vendor: {
	status: VendorStatus;
	securityOnboardingCompletedAt?: Date | string;
	securityPinSet?: boolean;
}) {
	if (
		vendor.status === VendorStatus.ACTIVE &&
		(!vendor.securityOnboardingCompletedAt || !vendor.securityPinSet)
	) {
		throw ErrVendorSecurityVerificationRequired;
	}
}
