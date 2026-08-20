import { ErrMenuItemNotFound } from "@/server/constants";
import {
	type DayOfWeek,
	getMenuItemsByIdsDB,
	upsertTimetableEntryDB,
} from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "@/server/services/vendors";

interface EntryInput {
	menuItemId: string;
	dayOfWeek: DayOfWeek;
	isOpen: boolean;
	orderStartTime?: string;
	cutoffTime?: string;
	cookingStartTime?: string;
	readyDeliveryStartTime?: string;
	plannedMenu?: string;
}

/** Confirm every referenced menu item belongs to the vendor. */
async function assertMenuItemsOwned(vendorId: string, menuItemIds: string[]) {
	const unique = [...new Set(menuItemIds)];
	const items = await getMenuItemsByIdsDB({ ids: unique });
	const ownedIds = new Set(
		items
			.filter((it) => String(it.vendorId) === vendorId)
			.map((it) => String(it.id ?? it._id)),
	);
	if (unique.some((id) => !ownedIds.has(id))) throw ErrMenuItemNotFound;
}

export async function upsertTimetableEntry({
	userId,
	menuItemId,
	dayOfWeek,
	isOpen,
	orderStartTime,
	cutoffTime,
	cookingStartTime,
	readyDeliveryStartTime,
	plannedMenu,
}: {
	userId: string;
} & EntryInput) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);

	await assertMenuItemsOwned(vendorId, [menuItemId]);

	return upsertTimetableEntryDB({
		vendorId,
		menuItemId,
		dayOfWeek,
		isOpen,
		orderStartTime,
		cutoffTime,
		cookingStartTime,
		readyDeliveryStartTime,
		plannedMenu,
	});
}

export async function upsertTimetableEntries({
	userId,
	entries,
}: {
	userId: string;
	entries: EntryInput[];
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);

	await assertMenuItemsOwned(
		vendorId,
		entries.map((e) => e.menuItemId),
	);

	const results = await Promise.all(
		entries.map((e) =>
			upsertTimetableEntryDB({
				vendorId,
				menuItemId: e.menuItemId,
				dayOfWeek: e.dayOfWeek,
				isOpen: e.isOpen,
				orderStartTime: e.orderStartTime,
				cutoffTime: e.cutoffTime,
				cookingStartTime: e.cookingStartTime,
				readyDeliveryStartTime: e.readyDeliveryStartTime,
				plannedMenu: e.plannedMenu,
			}),
		),
	);
	return results;
}
