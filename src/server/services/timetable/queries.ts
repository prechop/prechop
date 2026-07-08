import {
	DayOfWeek,
	getMenuItemsByIdsDB,
	type IMenuItem,
	type ITimetableEntry,
	listTimetableByVendorDB,
} from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "@/server/services/vendors";

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

/** Full weekly grid for the authenticated vendor. */
export async function getTimetable({ userId }: { userId: string }) {
	const vendor = await resolveVendorByUserId({ userId });
	return listTimetableByVendorDB({ vendorId: vendorIdOf(vendor) });
}

/** Entries for a single day of the week. */
export async function getTimetableForDay({
	userId,
	dayOfWeek,
}: {
	userId: string;
	dayOfWeek: DayOfWeek;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const entries = await listTimetableByVendorDB({
		vendorId: vendorIdOf(vendor),
	});
	return entries.filter((e) => e.dayOfWeek === dayOfWeek);
}

/** Open entries for today, joined with their menu item. */
export async function getTodayTemplate({ userId }: { userId: string }) {
	const vendor = await resolveVendorByUserId({ userId });
	const entries = await listTimetableByVendorDB({
		vendorId: vendorIdOf(vendor),
	});
	const day = todayDayOfWeek();
	const open = entries.filter((e) => e.dayOfWeek === day && e.isOpen);

	const menuItems = await getMenuItemsByIdsDB({
		ids: open.map((e) => String(e.menuItemId)),
	});
	const byId = new Map<string, IMenuItem>(
		menuItems.map((m) => [String(m.id ?? m._id), m]),
	);

	return open.map((entry: ITimetableEntry) => ({
		...entry,
		menuItem: byId.get(String(entry.menuItemId)) ?? null,
	}));
}
