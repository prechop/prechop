import { ErrMenuItemNotFound, nairaToKobo } from "@/server/constants";
import {
	type IMenuItem,
	type MenuCategory,
	updateMenuItemDB,
} from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "@/server/services/vendors";

export async function updateMenuItem({
	userId,
	itemId,
	name,
	category,
	priceNaira,
	description,
	estimatedPrepMin,
	displayOrder,
}: {
	userId: string;
	itemId: string;
	name?: string;
	category?: MenuCategory;
	priceNaira?: number;
	description?: string;
	estimatedPrepMin?: number;
	displayOrder?: number;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);

	const payload: Partial<IMenuItem> = {};
	if (name !== undefined) payload.name = name;
	if (category !== undefined) payload.category = category;
	if (priceNaira !== undefined) payload.priceKobo = nairaToKobo(priceNaira);
	if (description !== undefined) payload.description = description;
	if (estimatedPrepMin !== undefined)
		payload.estimatedPrepMin = estimatedPrepMin;
	if (displayOrder !== undefined) payload.displayOrder = displayOrder;

	const updated = await updateMenuItemDB({ id: itemId, vendorId, payload });
	if (!updated) throw ErrMenuItemNotFound;
	return updated;
}
