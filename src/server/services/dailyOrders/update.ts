import { ErrDailyOrderNotFound, ErrForbidden } from "../../constants";
import {
	getVendorProfileByUserIdDB,
	updateDailyOrderDraftDB,
} from "../../models";
import type { IDailyOrderCreateInput } from "../../models/dailyOrders/types";
import type { UpdateDailyOrderDraftInput } from "../../validators/dailyOrders/validate";
import { buildSnapshotItems } from "./snapshot";

export async function updateDailyOrderDraft({
	userId,
	orderId,
	input,
}: {
	userId: string;
	orderId: string;
	input: UpdateDailyOrderDraftInput;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrForbidden;

	const vendorId = vendor._id.toString();
	const payload: Partial<IDailyOrderCreateInput> = {};
	if (input.title !== undefined) payload.title = input.title;
	if (input.scheduledDate !== undefined)
		payload.scheduledDate = new Date(input.scheduledDate);
	if (input.cutoffTime !== undefined)
		payload.cutoffTime = new Date(input.cutoffTime);
	if (input.pickupAvailable !== undefined)
		payload.pickupAvailable = input.pickupAvailable;
	if (input.deliveryAvailable !== undefined)
		payload.deliveryAvailable = input.deliveryAvailable;
	if (input.deliveryFeeKobo !== undefined)
		payload.deliveryFeeKobo = input.deliveryFeeKobo;
	if (input.items !== undefined) {
		payload.items = await buildSnapshotItems({
			vendorId,
			items: input.items,
		});
	}

	const updated = await updateDailyOrderDraftDB({
		id: orderId,
		vendorId,
		payload,
	});
	if (!updated) throw ErrDailyOrderNotFound;
	return updated;
}
