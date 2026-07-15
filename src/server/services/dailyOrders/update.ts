import {
	conflict,
	ErrDailyOrderNotFound,
	ErrForbidden,
	ErrVendorNotActive,
	validationError,
} from "../../constants";
import {
	DailyOrderStatus,
	getDailyOrderByIdDB,
	getVendorProfileByUserIdDB,
	updateDailyOrderDraftDB,
	VendorStatus,
} from "../../models";
import type { IDailyOrderCreateInput } from "../../models/dailyOrders/types";
import type { UpdateDailyOrderDraftInput } from "../../validators/dailyOrders/validate";
import { buildSnapshotItems } from "./snapshot";

/**
 * Edit an existing daily-order listing. A vendor may change any field while the
 * listing has not yet opened for orders — i.e. its `availableFrom` is still in
 * the future. The instant `availableFrom` passes (or if it was never set, so
 * the listing opened the moment it was published) editing is locked, because
 * buyers may already be ordering against it. Closed and cancelled listings are
 * never editable. The vendor must be ACTIVE.
 */
export async function updateDailyOrder({
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
	if (vendor.status !== VendorStatus.ACTIVE) throw ErrVendorNotActive;
	const vendorId = vendor._id.toString();

	const existing = await getDailyOrderByIdDB({ id: orderId });
	if (!existing || existing.vendorId.toString() !== vendorId) {
		throw ErrDailyOrderNotFound;
	}

	const now = new Date();
	const isTerminal =
		existing.status === DailyOrderStatus.CLOSED ||
		existing.status === DailyOrderStatus.CANCELLED;
	const opensAt = existing.availableFrom
		? new Date(existing.availableFrom)
		: null;
	// Editable only while orders have not opened yet.
	if (isTerminal || !opensAt || opensAt.getTime() <= now.getTime()) {
		throw conflict(
			"Editing is closed — orders have already opened for this listing.",
		);
	}

	const payload: Partial<IDailyOrderCreateInput> = {};
	if (input.title !== undefined) payload.title = input.title;
	if (input.scheduledDate !== undefined)
		payload.scheduledDate = new Date(input.scheduledDate);
	if (input.availableFrom !== undefined)
		payload.availableFrom = new Date(input.availableFrom);
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

	// Validate the resulting window (using new values where supplied, existing
	// otherwise): orders must still open in the future and before they close.
	const effAvailableFrom = payload.availableFrom ?? opensAt;
	const effCutoff = payload.cutoffTime ?? new Date(existing.cutoffTime);
	if (effAvailableFrom.getTime() <= now.getTime()) {
		throw validationError("Orders must open at a future time.");
	}
	if (effAvailableFrom.getTime() >= effCutoff.getTime()) {
		throw validationError("Orders must open before they close.");
	}

	const updated = await updateDailyOrderDraftDB({
		id: orderId,
		vendorId,
		payload,
		now,
	});
	if (!updated) throw ErrDailyOrderNotFound;
	return updated;
}
