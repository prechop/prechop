import { ErrForbidden } from "@/server/constants";
import {
	getVendorProfileByUserIdDB,
	type IVendorProfile,
} from "@/server/models";

/** Resolve the vendor profile owned by the authenticated user. */
export async function resolveVendorByUserId({
	userId,
}: {
	userId: string;
}): Promise<IVendorProfile> {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrForbidden;
	return vendor;
}

/** The persisted string id of a vendor profile (aggregate `id` or `_id`). */
export function vendorIdOf(vendor: IVendorProfile): string {
	return String(vendor.id ?? vendor._id);
}
