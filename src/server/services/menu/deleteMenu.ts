import { ErrMenuItemNotFound } from "@/server/constants";
import { softDeleteMenuItemDB } from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "@/server/services/vendors";

export async function deleteMenuItem({
	userId,
	itemId,
}: {
	userId: string;
	itemId: string;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const deleted = await softDeleteMenuItemDB({
		id: itemId,
		vendorId: vendorIdOf(vendor),
	});
	if (!deleted) throw ErrMenuItemNotFound;
	return { deleted: true };
}
