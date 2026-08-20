import { normalizeMenuCategory } from "@/constants/menuCategories";
import { ErrMenuItemNotFound, nairaToKobo } from "@/server/constants";
import {
	type IMenuItem,
	type MenuCategory,
	updateMenuItemDB,
} from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "@/server/services/vendors";
import { resolveOwnedOptionGroupIds } from "./optionGroupsResolve";

export async function updateMenuItem({
	userId,
	itemId,
	name,
	category,
	priceNaira,
	variants,
	description,
	imageUrl,
	estimatedPrepMin,
	displayOrder,
	optionGroupIds,
}: {
	userId: string;
	itemId: string;
	name?: string;
	category?: MenuCategory;
	priceNaira?: number;
	variants?: Array<{
		name: string;
		priceNaira: number;
		isDefault?: boolean;
		isActive?: boolean;
	}>;
	description?: string;
	imageUrl?: string;
	estimatedPrepMin?: number;
	displayOrder?: number;
	optionGroupIds?: string[];
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);

	const payload: Partial<IMenuItem> = {};
	if (name !== undefined) payload.name = name;
	if (category !== undefined)
		payload.category = normalizeMenuCategory(category) as MenuCategory;
	if (priceNaira !== undefined) payload.priceKobo = nairaToKobo(priceNaira);
	if (variants !== undefined)
		payload.variants = variants.map((variant, displayOrder) => ({
			name: variant.name,
			priceKobo: nairaToKobo(variant.priceNaira),
			isDefault: variant.isDefault ?? false,
			isActive: variant.isActive ?? true,
			displayOrder,
		}));
	if (description !== undefined) payload.description = description;
	if (imageUrl !== undefined) payload.imageUrl = imageUrl;
	if (estimatedPrepMin !== undefined)
		payload.estimatedPrepMin = estimatedPrepMin;
	if (displayOrder !== undefined) payload.displayOrder = displayOrder;
	const resolvedGroupIds = await resolveOwnedOptionGroupIds({
		vendorId,
		optionGroupIds,
	});
	if (resolvedGroupIds !== undefined)
		payload.optionGroupIds = resolvedGroupIds;

	const updated = await updateMenuItemDB({ id: itemId, vendorId, payload });
	if (!updated) throw ErrMenuItemNotFound;
	return updated;
}
