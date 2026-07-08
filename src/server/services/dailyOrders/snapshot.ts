import {
	ErrForbidden,
	nairaToKobo,
	notFound,
	validationError,
} from "../../constants";
import { getMenuItemsByIdsDB, MenuCategory } from "../../models";
import type { IDailyOrderItemInput } from "../../models/dailyOrders/types";
import type { DailyOrderItemInput } from "../../validators/dailyOrders/validate";

/**
 * Resolve requested menu items into frozen daily-order item snapshots. Validates
 * every item belongs to the vendor and that add-ons are only attached to MEALS.
 */
export async function buildSnapshotItems({
	vendorId,
	items,
}: {
	vendorId: string;
	items: DailyOrderItemInput[];
}): Promise<IDailyOrderItemInput[]> {
	const ids = items.map((it) => it.menuItemId);
	const menuItems = await getMenuItemsByIdsDB({ ids });
	const byId = new Map(menuItems.map((m) => [(m.id ?? m._id).toString(), m]));

	return items.map((it) => {
		const menuItem = byId.get(it.menuItemId);
		if (!menuItem) throw notFound("Menu item");
		if (menuItem.vendorId.toString() !== vendorId) throw ErrForbidden;
		if (it.addons?.length && menuItem.category !== MenuCategory.MEALS) {
			throw validationError("Add-ons are only allowed on meal items.");
		}
		return {
			menuItemId: (menuItem.id ?? menuItem._id).toString(),
			snapshotName: menuItem.name,
			snapshotPriceKobo: menuItem.priceKobo,
			snapshotImageUrl: menuItem.imageUrl,
			snapshotPrepMin: menuItem.estimatedPrepMin,
			maxQuantity: it.maxQuantity ?? null,
			addons: (it.addons ?? []).map((a, i) => ({
				name: a.name,
				priceKobo: nairaToKobo(a.priceNaira),
				displayOrder: i,
			})),
		};
	});
}
