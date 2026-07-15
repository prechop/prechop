import { ErrVendorNotFound } from "../../constants";
import {
	closeActiveDailyOrdersByVendorDB,
	getVendorProfileByIdDB,
	listVendorsDB,
	setVendorStatusDB,
	VendorStatus,
} from "../../models";
import { resendProvider } from "../../providers";
import { recordAudit } from "../audit";

export interface AdminActor {
	userId: string;
	role: string;
	ip?: string;
	userAgent?: string;
}

export function listVendors({
	campusId,
	status,
}: {
	campusId?: string;
	status?: VendorStatus;
}) {
	return listVendorsDB({ campusId, status });
}

export async function getVendor(id: string) {
	const vendor = await getVendorProfileByIdDB({ id });
	if (!vendor) throw ErrVendorNotFound;
	return vendor;
}

export async function suspendVendor({
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

	await setVendorStatusDB({ id, status: VendorStatus.SUSPENDED });
	const closedListings = await closeActiveDailyOrdersByVendorDB({
		vendorId: id,
	});

	recordAudit({
		userId: actor.userId,
		role: actor.role,
		action: "VENDOR_SUSPEND",
		resourceType: "vendorProfiles",
		resourceId: id,
		newState: { reason, closedListings },
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});

	await resendProvider.sendVendorSuspended(
		vendor.email,
		vendor.businessName ?? "Vendor",
		reason,
	);

	return { ...vendor, status: VendorStatus.SUSPENDED, closedListings };
}

export async function reactivateVendor({
	id,
	actor,
}: {
	id: string;
	actor: AdminActor;
}) {
	const vendor = await getVendorProfileByIdDB({ id });
	if (!vendor) throw ErrVendorNotFound;

	await setVendorStatusDB({ id, status: VendorStatus.ACTIVE });

	recordAudit({
		userId: actor.userId,
		role: actor.role,
		action: "VENDOR_REACTIVATE",
		resourceType: "vendorProfiles",
		resourceId: id,
		newState: { status: VendorStatus.ACTIVE },
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});

	return { ...vendor, status: VendorStatus.ACTIVE };
}
