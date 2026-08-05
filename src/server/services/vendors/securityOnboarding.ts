import bcrypt from "bcrypt";
import { AppError, ErrVendorNotFound } from "@/server/constants";
import {
	getVendorSecuritySecretsByUserIdDB,
	updateVendorSecurityOnboardingDB,
} from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";

export const ErrVendorSecurityVerificationRequired = new AppError(
	"Enter your vendor security PIN before changing payout details.",
	403,
	"VENDOR_SECURITY_VERIFICATION_REQUIRED",
);

export const ErrVendorSecurityPinNotSet = new AppError(
	"Create your vendor security PIN before changing payout details.",
	403,
	"VENDOR_SECURITY_PIN_NOT_SET",
);

export const ErrVendorSecurityPinInvalid = new AppError(
	"Security PIN is incorrect.",
	403,
	"VENDOR_SECURITY_PIN_INVALID",
);

export const ErrVendorSecurityPinAlreadySet = new AppError(
	"Vendor security PIN is already set.",
	409,
	"VENDOR_SECURITY_PIN_ALREADY_SET",
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
	if (action === "COMPLETE" && vendor.securityPinSet) {
		throw ErrVendorSecurityPinAlreadySet;
	}
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

export function assertVendorSecurityPinReady(vendor: {
	securityOnboardingCompletedAt?: Date | string;
	securityPinSet?: boolean;
}) {
	if (!vendor.securityOnboardingCompletedAt || !vendor.securityPinSet) {
		throw ErrVendorSecurityPinNotSet;
	}
}

export async function verifyVendorSecurityPinForSensitiveAction({
	userId,
	pin,
}: {
	userId: string;
	pin: string;
}) {
	const vendor = await getVendorSecuritySecretsByUserIdDB({ userId });
	if (!vendor) throw ErrVendorNotFound;
	if (!vendor.securityOnboardingCompletedAt || !vendor.securityPinHash) {
		throw ErrVendorSecurityPinNotSet;
	}
	const ok = await bcrypt.compare(pin, vendor.securityPinHash);
	if (!ok) throw ErrVendorSecurityPinInvalid;
	return true;
}

export async function assertFreshVendorSecurityPinForSensitiveAction({
	userId,
	pin,
}: {
	userId: string;
	pin?: string;
}) {
	if (!pin?.trim()) throw ErrVendorSecurityVerificationRequired;
	return verifyVendorSecurityPinForSensitiveAction({
		userId,
		pin: pin.trim(),
	});
}

export { assertPinResetHoldNotActive, invalidateVendorPinSessions } from "./forgotPin";
