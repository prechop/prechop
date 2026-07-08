import { listMenuItemsByVendorDB } from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "@/server/services/vendors";

export async function listMenu({ userId }: { userId: string }) {
	const vendor = await resolveVendorByUserId({ userId });
	return listMenuItemsByVendorDB({ vendorId: vendorIdOf(vendor) });
}
