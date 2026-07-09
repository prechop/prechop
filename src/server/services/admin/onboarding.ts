import { AppError, ErrVendorNotFound } from "../../constants";
import {
	getUserByIdDB,
	getVendorProfileByIdDB,
	listVendorsDB,
	reviewVendorDB,
	VendorStatus,
} from "../../models";
import { resendProvider } from "../../providers";
import { recordAudit } from "../audit";
import type { AdminActor } from "./vendors";

const ErrNotUnderReview = new AppError(
	"This vendor is not awaiting review.",
	409,
	"NOT_UNDER_REVIEW",
);

/** Vendors currently awaiting admin review (the onboarding queue). */
export function listOnboardingQueue({ campusId }: { campusId?: string } = {}) {
	return listVendorsDB({ campusId, status: VendorStatus.PENDING_REVIEW });
}

/**
 * A full onboarding submission: the vendor profile plus the owning user's
 * contact details, so a reviewer sees everything attached in one place.
 */
export async function getOnboardingSubmission(id: string) {
	const vendor = await getVendorProfileByIdDB({ id });
	if (!vendor) throw ErrVendorNotFound;
	const owner = await getUserByIdDB({ id: vendor.userId.toString() });
	return {
		vendor,
		owner: owner
			? {
					id: owner._id.toString(),
					firstName: owner.firstName,
					lastName: owner.lastName,
					isPhoneVerified: owner.isPhoneVerified,
					createdAt: owner.createdAt,
				}
			: null,
	};
}

export async function approveVendor({
	id,
	notes,
	actor,
}: {
	id: string;
	notes?: string;
	actor: AdminActor;
}) {
	const vendor = await getVendorProfileByIdDB({ id });
	if (!vendor) throw ErrVendorNotFound;
	if (vendor.status !== VendorStatus.PENDING_REVIEW) throw ErrNotUnderReview;

	await reviewVendorDB({
		id,
		status: VendorStatus.ACTIVE,
		reviewedBy: actor.userId,
		reviewNotes: notes,
	});

	recordAudit({
		userId: actor.userId,
		role: actor.role,
		action: "VENDOR_ONBOARDING_APPROVE",
		resourceType: "vendorProfiles",
		resourceId: id,
		previousState: { status: vendor.status },
		newState: { status: VendorStatus.ACTIVE, notes },
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});

	await resendProvider.sendVendorApproved(
		vendor.email,
		vendor.businessName ?? "there",
	);

	return { ...vendor, status: VendorStatus.ACTIVE };
}

export async function rejectVendor({
	id,
	reason,
	actor,
}: {
	id: string;
	reason: string;
	actor: AdminActor;
}) {
	const vendor = await getVendorProfileByIdDB({ id });
	if (!vendor) throw ErrVendorNotFound;
	if (vendor.status !== VendorStatus.PENDING_REVIEW) throw ErrNotUnderReview;

	await reviewVendorDB({
		id,
		status: VendorStatus.CHANGES_REQUESTED,
		reviewedBy: actor.userId,
		rejectionReason: reason,
	});

	recordAudit({
		userId: actor.userId,
		role: actor.role,
		action: "VENDOR_ONBOARDING_REJECT",
		resourceType: "vendorProfiles",
		resourceId: id,
		previousState: { status: vendor.status },
		newState: { status: VendorStatus.CHANGES_REQUESTED, reason },
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});

	await resendProvider.sendVendorChangesRequested(
		vendor.email,
		vendor.businessName ?? "there",
		reason,
	);

	return { ...vendor, status: VendorStatus.CHANGES_REQUESTED };
}
