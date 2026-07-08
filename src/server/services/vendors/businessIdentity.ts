import { conflict } from "@/server/constants";
import {
	getVendorProfileByEmailDB,
	updateVendorProfileDB,
	type VendorType,
} from "@/server/models";
import { recomputeVendorCompleteness } from "./recomputeVendorCompleteness";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";

export async function updateBusinessIdentity({
	userId,
	businessName,
	vendorType,
	description,
	email,
}: {
	userId: string;
	businessName: string;
	vendorType?: VendorType;
	description?: string;
	email: string;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);

	const existing = await getVendorProfileByEmailDB({ email });
	if (existing && vendorIdOf(existing) !== vendorId) {
		throw conflict("This email is already in use.");
	}

	const updated = await updateVendorProfileDB({
		id: vendorId,
		payload: { businessName, vendorType, description, email },
	});

	await recomputeVendorCompleteness({ vendorId, userId });
	return updated;
}
