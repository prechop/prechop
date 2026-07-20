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
	getOptionGroupsByIdsDB,
	getVendorProfileByUserIdDB,
	type IOptionGroup,
	listTimetableByVendorDB,
	setDailyOrderStatusDB,
	VendorStatus,
} from "../../models";
import type {
	IDailyOrderItemInput,
	IDailyOrderOptionGroupInput,
} from "../../models/dailyOrders/types";
import type { CreateFromTemplateInput } from "../../validators/dailyOrders/validate";

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

	// Auto-resolve each scheduled item's attached option groups from the library.
	const referencedGroupIds = Array.from(
		new Set(menuItems.flatMap((m) => m.optionGroupIds ?? [])),
	);
	const libraryGroups = referencedGroupIds.length
		? await getOptionGroupsByIdsDB({ ids: referencedGroupIds, vendorId })
		: [];
	const groupById = new Map(
		libraryGroups.map((g) => [(g.id ?? g._id).toString(), g]),
	);

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
			optionGroups: (menuItem.optionGroupIds ?? [])
				.map((gid: string) => groupById.get(gid.toString()))
				.filter((g): g is IOptionGroup => Boolean(g))
				.map(groupFromLibrary),
		});
	}
	if (items.length === 0) {
		throw validationError("No menu items are scheduled for today.");
	}
	if (!vendor.campusId) {
		throw validationError(
			"Complete your vendor campus before posting food.",
		);
	}

	const created = await createDailyOrderDB({
		payload: {
			vendorId,
			campusId: vendor.campusId.toString(),
			shareableToken: generateShareableToken(),
			title: input.title,
			scheduledDate: new Date(input.scheduledDate),
			availableFrom: input.availableFrom
				? new Date(input.availableFrom)
				: undefined,
			cutoffTime: new Date(input.cutoffTime),
			pickupAvailable: input.pickupAvailable,
			deliveryAvailable: input.deliveryAvailable,
			deliveryFeeKobo: input.deliveryFeeKobo,
			deliveryCoverage: input.deliveryCoverage,
			deliveryEstimateMinutes: input.deliveryEstimateMinutes,
			deliveryContactPhone: input.deliveryContactPhone,
			deliveryResponsibilityAccepted:
				input.deliveryResponsibilityAccepted,
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
