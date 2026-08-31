import { normalizeMenuCategory } from "@/constants/menuCategories";
import { nairaToKobo, validationError } from "@/server/constants";
import { createMenuItemDB, type MenuCategory, type MealTime } from "@/server/models";
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
	variants,
	description,
	imageUrl,
	estimatedPrepMin,
	displayOrder,
	optionGroupIds,
	mealTimes,
}: {
	userId: string;
	name: string;
	category: MenuCategory;
	priceNaira: number;
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
	mealTimes?: MealTime[];
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);
	if (!vendor.campusId) {
		throw validationError(
			"Complete your vendor campus before adding menu items.",
		);
	}

	const item = await createMenuItemDB({
		payload: {
			vendorId,
			campusId: vendor.campusId,
			category: normalizeMenuCategory(category) as MenuCategory,
			name,
			priceKobo: nairaToKobo(priceNaira),
			variants: variants?.map((variant, displayOrder) => ({
				name: variant.name,
				priceKobo: nairaToKobo(variant.priceNaira),
				isDefault: variant.isDefault ?? false,
				isActive: variant.isActive ?? true,
				displayOrder,
			})),
			description,
			imageUrl,
			estimatedPrepMin,
			displayOrder,
			optionGroupIds: await resolveOwnedOptionGroupIds({
				vendorId,
				optionGroupIds,
			}),
			mealTimes,
		},
	});

	await recomputeVendorCompleteness({ vendorId, userId });
	return item;
}
