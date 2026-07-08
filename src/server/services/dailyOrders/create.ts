import {
	ErrForbidden,
	ErrVendorNotActive,
	generateShareableToken,
} from "../../constants";
import {
	createDailyOrderDB,
	DailyOrderStatus,
	getDailyOrderByIdDB,
	getVendorProfileByUserIdDB,
	setDailyOrderStatusDB,
	VendorStatus,
} from "../../models";
import type { CreateDailyOrderInput } from "../../validators/dailyOrders/validate";
import { buildSnapshotItems } from "./snapshot";

export async function createDailyOrder({
	userId,
	input,
}: {
	userId: string;
	input: CreateDailyOrderInput;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrForbidden;
	if (vendor.status !== VendorStatus.ACTIVE) throw ErrVendorNotActive;

	const vendorId = vendor._id.toString();
	const items = await buildSnapshotItems({ vendorId, items: input.items });

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
