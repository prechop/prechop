import { AppError, ErrVendorNotFound } from "@/server/constants";
import {
	getVendorProfileByIdDB,
	submitVendorForReviewDB,
	VendorStatus,
} from "@/server/models";
import { resendProvider } from "@/server/providers";
import { recordAudit } from "@/server/services/audit";
import { getSiteConfigs } from "@/server/services/siteConfigs";
import { recomputeVendorCompleteness } from "./recomputeVendorCompleteness";

const ErrNotSubmittable = new AppError(
	"Complete every onboarding step before submitting for review.",
	409,
	"NOT_SUBMITTABLE",
);
const ErrAlreadySubmitted = new AppError(
	"Your application is already submitted or approved.",
	409,
	"ALREADY_SUBMITTED",
);

/**
 * Vendor action: submit the profile for admin review. Allowed only from
 * INCOMPLETE or CHANGES_REQUESTED, and only when the profile completeness meets
 * the configured threshold. Moves the vendor to PENDING_REVIEW (read-only).
 */
export async function submitVendorForReview({
	vendorId,
	userId,
	ip,
	userAgent,
}: {
	vendorId: string;
	userId: string;
	ip?: string;
	userAgent?: string;
}): Promise<{ status: VendorStatus; profileCompleteness: number }> {
	const vendor = await getVendorProfileByIdDB({ id: vendorId });
	if (!vendor) throw ErrVendorNotFound;

	if (
		vendor.status !== VendorStatus.INCOMPLETE &&
		vendor.status !== VendorStatus.CHANGES_REQUESTED
	) {
		throw ErrAlreadySubmitted;
	}

	// Recompute against live onboarding state so the gate can't be bypassed.
	const { profileCompleteness } = await recomputeVendorCompleteness({
		vendorId,
		userId,
	});
	const { profileCompletenessRequired } = await getSiteConfigs();
	if (profileCompleteness < profileCompletenessRequired) {
		throw ErrNotSubmittable;
	}

	await submitVendorForReviewDB({ id: vendorId });

	recordAudit({
		userId,
		action: "VENDOR_SUBMIT_FOR_REVIEW",
		resourceType: "vendorProfiles",
		resourceId: vendorId,
		newState: { status: VendorStatus.PENDING_REVIEW, profileCompleteness },
		ipAddress: ip,
		userAgent,
	});

	await resendProvider.sendVendorSubmissionReceived(
		vendor.email,
		vendor.businessName ?? "there",
	);

	return { status: VendorStatus.PENDING_REVIEW, profileCompleteness };
}
