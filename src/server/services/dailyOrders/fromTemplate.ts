import {
	ErrForbidden,
	ErrVendorNotActive,
	generateShareableToken,
	validationError,
} from "../../constants";
import {
	createDailyOrderDB,
	DailyOrderStatus,
	DayOfWeek,
	getDailyOrderByIdDB,
	getMenuItemsByIdsDB,
	getVendorProfileByUserIdDB,
	listTimetableByVendorDB,
	setDailyOrderStatusDB,
	VendorStatus,
} from "../../models";
import type { IDailyOrderItemInput } from "../../models/dailyOrders/types";
import type { CreateFromTemplateInput } from "../../validators/dailyOrders/validate";

const DAY_OF_WEEK_BY_INDEX: DayOfWeek[] = [
	DayOfWeek.SUNDAY,
	DayOfWeek.MONDAY,
	DayOfWeek.TUESDAY,
	DayOfWeek.WEDNESDAY,
	DayOfWeek.THURSDAY,
	DayOfWeek.FRIDAY,
	DayOfWeek.SATURDAY,
];

export async function createDailyOrderFromTemplate({
	userId,
	input,
}: {
	userId: string;
	input: CreateFromTemplateInput;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrForbidden;
	if (vendor.status !== VendorStatus.ACTIVE) throw ErrVendorNotActive;

	const vendorId = vendor._id.toString();
	const today = DAY_OF_WEEK_BY_INDEX[new Date().getDay()];

	const entries = await listTimetableByVendorDB({ vendorId });
	const todaysEntries = entries.filter(
		(e) => e.dayOfWeek === today && e.isOpen,
	);
	if (todaysEntries.length === 0) {
		throw validationError("No menu items are scheduled for today.");
	}

	const menuItems = await getMenuItemsByIdsDB({
		ids: todaysEntries.map((e) => e.menuItemId.toString()),
	});
	const byId = new Map(menuItems.map((m) => [(m.id ?? m._id).toString(), m]));

	const items: IDailyOrderItemInput[] = [];
	for (const entry of todaysEntries) {
		const menuItem = byId.get(entry.menuItemId.toString());
		if (!menuItem) continue;
		items.push({
			menuItemId: (menuItem.id ?? menuItem._id).toString(),
			snapshotName: menuItem.name,
			snapshotPriceKobo: menuItem.priceKobo,
			snapshotImageUrl: menuItem.imageUrl,
			snapshotPrepMin: menuItem.estimatedPrepMin,
			maxQuantity: null,
			addons: [],
		});
	}
	if (items.length === 0) {
		throw validationError("No menu items are scheduled for today.");
	}

	const created = await createDailyOrderDB({
		payload: {
			vendorId,
			campusId: vendor.campusId.toString(),
			shareableToken: generateShareableToken(),
			title: input.title,
			scheduledDate: new Date(input.scheduledDate),
			cutoffTime: new Date(input.cutoffTime),
			pickupAvailable: input.pickupAvailable,
			deliveryAvailable: input.deliveryAvailable,
			deliveryFeeKobo: input.deliveryFeeKobo,
			items,
		},
	});
	if (!created) throw ErrForbidden;

	const id = created._id.toString();
	if (!input.draft) {
		await setDailyOrderStatusDB({
			id,
			vendorId,
			status: DailyOrderStatus.ACTIVE,
		});
	}

	return (await getDailyOrderByIdDB({ id })) ?? created;
}
