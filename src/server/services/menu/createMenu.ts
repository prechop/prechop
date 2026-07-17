import { nairaToKobo } from "@/server/constants";
import { normalizeMenuCategory } from "@/constants/menuCategories";
import { createMenuItemDB, type MenuCategory } from "@/server/models";
import {
	recomputeVendorCompleteness,
	resolveVendorByUserId,
	vendorIdOf,
} from "@/server/services/vendors";
import { resolveOwnedOptionGroupIds } from "./optionGroupsResolve";

export async function createMenuItem({
	userId,
	name,
	category,
	priceNaira,
	description,
	estimatedPrepMin,
	displayOrder,
	optionGroupIds,
}: {
	userId: string;
	name: string;
	category: MenuCategory;
	priceNaira: number;
	description?: string;
	estimatedPrepMin?: number;
	displayOrder?: number;
	optionGroupIds?: string[];
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);

	const item = await createMenuItemDB({
		payload: {
			vendorId,
			campusId: vendor.campusId,
			category: normalizeMenuCategory(category) as MenuCategory,
			name,
			priceKobo: nairaToKobo(priceNaira),
			description,
			estimatedPrepMin,
			displayOrder,
			optionGroupIds: await resolveOwnedOptionGroupIds({
				vendorId,
				optionGroupIds,
			}),
		},
	});

	await recomputeVendorCompleteness({ vendorId, userId });
	return item;
}
