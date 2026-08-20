import {
	DayOfWeek,
	getMenuItemsByIdsDB,
	type IMenuItem,
	type ITimetableEntry,
	listTimetableByVendorDB,
} from "@/server/models";

const DAY_BY_INDEX: DayOfWeek[] = [
	DayOfWeek.SUNDAY,
	DayOfWeek.MONDAY,
	DayOfWeek.TUESDAY,
	DayOfWeek.WEDNESDAY,
	DayOfWeek.THURSDAY,
	DayOfWeek.FRIDAY,
	DayOfWeek.SATURDAY,
];

export function todayDayOfWeek(now: Date = new Date()): DayOfWeek {
	return DAY_BY_INDEX[now.getDay()];
}

/** Full weekly grid for the authenticated vendor (extended with time slots). */
export async function getExtendedTimetable({ userId }: { userId: string }) {
	const vendor = await (await import("@/server/services/vendors")).resolveVendorByUserId({
		userId,
	});
	const vendorId = (await import("@/server/services/vendors")).vendorIdOf(vendor);
	return listTimetableByVendorDB({ vendorId });
}

/** Public weekly timetable for a vendor (customer-facing). */
export async function getPublicTimetable({
	vendorId,
}: {
	vendorId: string;
}): Promise<(ITimetableEntry & { menuItem?: IMenuItem | null })[]> {
	const entries = await listTimetableByVendorDB({ vendorId });
	const menuItemIds = entries
		.filter((e) => e.menuItemId)
		.map((e) => String(e.menuItemId));
	const menuItems = menuItemIds.length
		? await getMenuItemsByIdsDB({ ids: menuItemIds })
		: [];
	const byId = new Map<string, IMenuItem>(
		menuItems.map((m) => [String(m.id ?? m._id), m]),
	);
	return entries.map((entry) => ({
		...entry,
		menuItem: byId.get(String(entry.menuItemId)) ?? null,
	}));
}
