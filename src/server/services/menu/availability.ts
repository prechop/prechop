import { ErrMenuItemNotFound } from "@/server/constants";
import { updateMenuItemDB } from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "@/server/services/vendors";

export async function setMenuItemAvailability({
	userId,
	itemId,
	isAvailable,
}: {
	userId: string;
	itemId: string;
	isAvailable: boolean;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const updated = await updateMenuItemDB({
		id: itemId,
		vendorId: vendorIdOf(vendor),
		payload: { isAvailable },
	});
	if (!updated) throw ErrMenuItemNotFound;
	return updated;
}

export async function setMenuItemSoldOut({
	userId,
	itemId,
	isSoldOut,
}: {
	userId: string;
	itemId: string;
	isSoldOut: boolean;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const updated = await updateMenuItemDB({
		id: itemId,
		vendorId: vendorIdOf(vendor),
		payload: { isSoldOut },
	});
	if (!updated) throw ErrMenuItemNotFound;
	return updated;
}
