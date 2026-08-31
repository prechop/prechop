import { ErrForbidden, nairaToKobo, notFound } from "../../constants";
import {
	getMenuItemsByIdsDB,
	getOptionGroupsByIdsDB,
	type IOptionGroup,
} from "../../models";
import type {
	IDailyOrderItemInput,
	IDailyOrderOptionGroupInput,
} from "../../models/dailyOrders/types";
import type { DailyOrderItemInput } from "../../validators/dailyOrders/validate";

/** A library group frozen into a listing-item snapshot input. */
function groupFromLibrary(group: IOptionGroup): IDailyOrderOptionGroupInput {
	return {
		sourceGroupId: (group.id ?? group._id).toString(),
		name: group.name,
		required: group.required,
		minSelect: group.minSelect,
		maxSelect: group.maxSelect ?? null,
		options: group.options.map((o, i) => ({
			name: o.name,
			priceKobo: o.priceKobo,
			displayOrder: o.displayOrder ?? i,
		})),
	};
}

/**
 * Resolve requested menu items into frozen daily-order item snapshots. Every
 * item must belong to the vendor. Each item's option groups are either taken
 * from the (editable) `optionGroups` supplied by the composer, or — when none
 * are supplied — auto-resolved from the menu item's attached library groups.
 */
export async function buildSnapshotItems({
	vendorId,
	items,
}: {
	vendorId: string;
	items: DailyOrderItemInput[];
}): Promise<IDailyOrderItemInput[]> {
	const { items: resolved } = await buildSnapshotItemsWithMealTimes({
		vendorId,
		items,
	});
	return resolved;
}

export async function buildSnapshotItemsWithMealTimes({
	vendorId,
	items,
}: {
	vendorId: string;
	items: DailyOrderItemInput[];
}): Promise<{ items: IDailyOrderItemInput[]; marketplaceCategories: string[] }> {
	const ids = items.map((it) => it.menuItemId);
	const menuItems = await getMenuItemsByIdsDB({ ids });
	const byId = new Map(menuItems.map((m) => [(m.id ?? m._id).toString(), m]));

	const referencedGroupIds = Array.from(
		new Set(
			items.flatMap((it) => {
				const menuItem = byId.get(it.menuItemId);
				return it.optionGroups ? [] : (menuItem?.optionGroupIds ?? []);
			}),
		),
	);
	const libraryGroups = referencedGroupIds.length
		? await getOptionGroupsByIdsDB({ ids: referencedGroupIds, vendorId })
		: [];
	const groupById = new Map(
		libraryGroups.map((g) => [(g.id ?? g._id).toString(), g]),
	);

	const seen = new Set<string>();
	const marketplaceCategories: string[] = [];

	const resolvedItems = items.map((it) => {
		const menuItem = byId.get(it.menuItemId);
		if (!menuItem) throw notFound("Menu item");
		if (menuItem.vendorId.toString() !== vendorId) throw ErrForbidden;
		const inheritedVariants = [...(menuItem.variants ?? [])].sort(
			(a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
		);

		const optionGroups: IDailyOrderOptionGroupInput[] = it.optionGroups
			? it.optionGroups.map((g) => ({
					sourceGroupId: g.sourceGroupId ?? null,
					name: g.name,
					required: g.required ?? false,
					minSelect: g.minSelect ?? 0,
					maxSelect: g.maxSelect ?? null,
					options: g.options.map((o, i) => ({
						name: o.name,
						priceKobo: nairaToKobo(o.priceNaira),
						displayOrder: i,
					})),
				}))
			: (menuItem.optionGroupIds ?? [])
					.map((gid: string) => groupById.get(gid.toString()))
					.filter((g): g is IOptionGroup => Boolean(g))
					.map(groupFromLibrary);

		for (const mealTime of menuItem.mealTimes ?? []) {
			if (!seen.has(mealTime)) {
				seen.add(mealTime);
				marketplaceCategories.push(mealTime);
			}
		}

		return {
			menuItemId: (menuItem.id ?? menuItem._id).toString(),
			category: menuItem.category,
			snapshotName: menuItem.name,
			snapshotDescription: menuItem.description,
			snapshotPriceKobo: menuItem.priceKobo,
			snapshotVariants: inheritedVariants.map((variant, index) => ({
				sourceVariantId:
					(variant.id ?? variant._id)?.toString() ?? null,
				name: variant.name,
				priceKobo: variant.priceKobo,
				isDefault: variant.isDefault,
				isActive: variant.isActive,
				displayOrder: variant.displayOrder ?? index,
			})),
			snapshotImageUrl: menuItem.imageUrl,
			snapshotPrepMin: menuItem.estimatedPrepMin,
			maxQuantity: it.maxQuantity ?? null,
			optionGroups,
		};
	});

	return { items: resolvedItems, marketplaceCategories };
}
