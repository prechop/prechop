import { AppError, ErrVendorNotFound } from "@/server/constants";
import { onboardingChecklist } from "@/server/helpers";
import {
	getVendorProfileByIdDB,
	submitVendorForReviewDB,
	VendorStatus,
} from "@/server/models";
import { resendProvider } from "@/server/providers";
import { recordAudit } from "@/server/services/audit";
import { notifyAdminAttention } from "@/server/services/notifications";
import { recomputeVendorCompleteness } from "./recomputeVendorCompleteness";

const ErrNotSubmittable = new AppError(
	"Complete every onboarding step before submitting for review.",
	409,
	"NOT_SUBMITTABLE",
);
const ErrAlreadySubmitted = new AppError(
	"Your application is already approved or unavailable for submission.",
	409,
	"ALREADY_SUBMITTED",
);

/**
 * Vendor action: submit or refresh the profile for admin review. Allowed from
 * INCOMPLETE, CHANGES_REQUESTED, or PENDING_REVIEW while pre-approval updates
 * are still permitted. Moves/keeps the vendor in PENDING_REVIEW.
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
	const wasResubmission = vendor.status === VendorStatus.CHANGES_REQUESTED;

	if (
		vendor.status !== VendorStatus.INCOMPLETE &&
		vendor.status !== VendorStatus.CHANGES_REQUESTED &&
		vendor.status !== VendorStatus.PENDING_REVIEW
	) {
		throw ErrAlreadySubmitted;
	}

	// Gate on the onboarding checklist — the steps an applicant can actually
	// complete before approval — NOT the marketplace completeness score (which
	// also requires menu items + timetable entries that live behind the
	// active-vendor gate and would otherwise deadlock every applicant).
	const checklist = onboardingChecklist({
		hasBusinessIdentity: !!vendor.businessName,
		hasCategory: (vendor.categories?.length ?? 0) > 0,
		hasLocation:
			vendor.locationType === "OFF_CAMPUS"
				? !!vendor.state &&
					!!vendor.areaOrAddress &&
					(vendor.campusIds?.length ?? 0) > 0
				: !!vendor.locationType && !!vendor.campusId,
		hasBankDetails: !!vendor.paystackSubaccountCode,
		hasProfileImage: !!vendor.profileImageUrl,
	});
	if (!checklist.complete) {
		throw ErrNotSubmittable;
	}

	// Recompute the marketplace completeness for display/audit (does not gate).
	const { profileCompleteness } = await recomputeVendorCompleteness({
		vendorId,
		userId,
	});

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
	await notifyAdminAttention({
		kind: wasResubmission
			? "VENDOR_APPLICATION_RESUBMISSION"
			: "VENDOR_APPLICATION",
		title: wasResubmission
			? "Vendor application resubmitted"
			: "New vendor application",
		whatHappened: `${vendor.businessName ?? "A vendor"} submitted an application for admin review.`,
		submittedBy: `${vendor.businessName ?? "Vendor"} (${vendor.email}; user ${userId})`,
		recordId: vendorId,
		adminPath: `/admin/onboarding?vendorId=${encodeURIComponent(vendorId)}`,
		dedupeKey: `vendor-application:${vendorId}:${wasResubmission ? "resubmission" : "new"}:${new Date().toISOString().slice(0, 10)}`,
	});

	return { status: VendorStatus.PENDING_REVIEW, profileCompleteness };
}
