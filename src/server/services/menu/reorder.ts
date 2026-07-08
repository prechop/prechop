import { ErrMenuItemNotFound } from "@/server/constants";
import { getMenuItemsByIdsDB, updateMenuItemDB } from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "@/server/services/vendors";

export async function reorderMenu({
	userId,
	items,
}: {
	userId: string;
	items: Array<{ id: string; displayOrder: number }>;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);

	const ids = items.map((i) => i.id);
	const owned = await getMenuItemsByIdsDB({ ids });
	const ownedIds = new Set(
		owned
			.filter((it) => String(it.vendorId) === vendorId)
			.map((it) => String(it.id ?? it._id)),
	);

	// Every id in the request must belong to this vendor.
	if (ids.some((id) => !ownedIds.has(id))) throw ErrMenuItemNotFound;

	await Promise.all(
		items.map((i) =>
			updateMenuItemDB({
				id: i.id,
				vendorId,
				payload: { displayOrder: i.displayOrder },
			}),
		),
	);

	return { updated: items.length };
}
