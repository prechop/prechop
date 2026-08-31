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
import { getSlotAvailability } from "../buyerOrders/slots";
import { buildSnapshotItemsWithMealTimes } from "./snapshot";

/**
 * Edit the current listing for future buyers. Buyer orders retain their own
 * immutable checkout snapshots; this operation never updates buyer-order data.
 * Closed and cancelled listings are historical and remain immutable.
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
	if (isTerminal) throw conflict("Closed listings cannot be edited.");

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
	if (input.deliveryCoverage !== undefined)
		payload.deliveryCoverage = input.deliveryCoverage;
	if (input.deliveryEstimateMinutes !== undefined)
		payload.deliveryEstimateMinutes = input.deliveryEstimateMinutes;
	if (input.deliveryContactPhone !== undefined)
		payload.deliveryContactPhone = input.deliveryContactPhone;
	if (input.deliveryResponsibilityAccepted !== undefined) {
		payload.deliveryResponsibilityAccepted =
			input.deliveryResponsibilityAccepted;
	}
	if (input.items !== undefined) {
		const { items: nextItems, marketplaceCategories } =
			await buildSnapshotItemsWithMealTimes({
				vendorId,
				items: input.items,
			});
		const availability = await getSlotAvailability(existing.items);
		const nextByMenuItem = new Map(
			nextItems.map((item) => [item.menuItemId.toString(), item]),
		);
		for (const current of existing.items) {
			const itemId = (current.id ?? current._id)?.toString() ?? "";
			const committed = current.orderedQuantity ?? 0;
			const reserved = availability.get(itemId)?.reservedQuantity ?? 0;
			const next = nextByMenuItem.get(current.menuItemId.toString());
			const listingAlreadyOpen =
				!existing.availableFrom ||
				new Date(existing.availableFrom).getTime() <= now.getTime();
			if (!next && committed + reserved > 0) {
				throw validationError(
					`"${current.snapshotName}" cannot be removed while quantities are committed or reserved.`,
				);
			}
			if (!next && listingAlreadyOpen) {
				throw validationError(
					`"${current.snapshotName}" cannot be removed after ordering opens. Hide it by setting its available quantity to the committed amount instead.`,
				);
			}
			if (
				listingAlreadyOpen &&
				next?.maxQuantity != null &&
				(current.maxQuantity == null ||
					next.maxQuantity < current.maxQuantity)
			) {
				throw validationError(
					`Available quantity for "${current.snapshotName}" can only be increased after ordering opens.`,
				);
			}
			if (
				next?.maxQuantity != null &&
				next.maxQuantity < committed + reserved
			) {
				throw validationError(
					`Quantity for "${current.snapshotName}" cannot be below ${committed + reserved} already committed or reserved.`,
				);
			}
		}
		payload.items = nextItems;
		payload.marketplaceCategories = marketplaceCategories as import("@/server/models").MealTime[];
	}

	// Validate the resulting window using new values where supplied. An already
	// open listing may retain its past opening time, but its cutoff stays future.
	const effAvailableFrom =
		payload.availableFrom ??
		(existing.availableFrom ? new Date(existing.availableFrom) : now);
	const effCutoff = payload.cutoffTime ?? new Date(existing.cutoffTime);
	if (effAvailableFrom.getTime() >= effCutoff.getTime()) {
		throw validationError("Orders must open before they close.");
	}
	if (effCutoff.getTime() <= now.getTime()) {
		throw validationError("Orders must close at a future time.");
	}

	const updated = await updateDailyOrderDraftDB({
		id: orderId,
		vendorId,
		payload,
		now,
	});
	if (!updated) {
		throw conflict("This listing changed while saving. Please try again.");
	}
	return updated;
}
