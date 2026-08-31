import {
	ErrBrandKitNotReceived,
	ErrForbidden,
	ErrVendorNotActive,
	generateShareableToken,
	validationError,
} from "../../constants";
import {
	BrandKitFulfillmentStatus,
	createDailyOrderDB,
	DailyOrderStatus,
	getDailyOrderByIdDB,
	getDeliveryWindowByIdDB,
	getVendorProfileByUserIdDB,
	listStickerBatchesByVendorDB,
	setDailyOrderStatusDB,
	StickerBatch,
	VendorStatus,
} from "../../models";
import type { CreateDailyOrderInput } from "../../validators/dailyOrders/validate";
import {
	buildSnapshotItems,
	buildSnapshotItemsWithMealTimes,
} from "./snapshot";
import {
	getTodaysBatches,
	isBatchPausedForToday,
	reserveBatchCapacity,
} from "../deliveryWindows/batches";
import { getDeliveryWindowCapacity } from "../deliveryWindows/capacity";
import { MealTime } from "@/server/models/enums";

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
	if (!vendor.campusId) {
		throw validationError(
			"Complete your vendor campus before posting food.",
		);
	}
	if (
		!input.draft &&
		vendor.brandKitFulfillmentStatus !== BrandKitFulfillmentStatus.RECEIVED
	) {
		throw ErrBrandKitNotReceived;
	}

	const vendorId = vendor._id.toString();
	const scheduledDate = new Date(input.scheduledDate);
	const today = new Date();
	const isToday =
		scheduledDate.getFullYear() === today.getFullYear() &&
		scheduledDate.getMonth() === today.getMonth() &&
		scheduledDate.getDate() === today.getDate();

	let mode: "A" | "B" = input.mode ?? "B";
	let deliveryWindowId = input.deliveryWindowId;
	let batchId = input.batchId;

	if (isToday && !input.draft && (input.mode === "A" || input.deliveryWindowId)) {
		mode = "A";
		let batches = await getTodaysBatches({
			vendorId,
			date: scheduledDate,
			mealTime: input.mealTime as MealTime | undefined,
		});

		if (!deliveryWindowId) {
			if (batches.length === 0) {
				throw validationError(
					"No active delivery windows are open for today. Configure delivery windows or schedule for a future date.",
				);
			}
			const available = batches.filter(
				(b) => b.status === "open" && b.capacity.remainingQuantity > 0,
			);
			if (available.length === 0) {
				throw validationError(
					"All delivery windows for today are full or paused. Try tomorrow or select a different window.",
				);
			}
			deliveryWindowId = available[0].window._id;
		} else {
			const explicit = await getDeliveryWindowByIdDB({ id: deliveryWindowId });
			if (!explicit || explicit.vendorId.toString() !== vendorId) {
				throw validationError("Selected delivery window is not available today.");
			}
			if (!explicit.active) {
				throw validationError("This delivery window is not active.");
			}
			if (explicit.mealTime !== input.mealTime) {
				throw validationError(
					`Selected delivery window is for ${explicit.mealTime.toLowerCase()}, not ${input.mealTime?.toLowerCase()}.`,
				);
			}
		const todayStr = scheduledDate.toISOString().slice(0, 10);
		const isOvernight = explicit.orderWindowEnd <= explicit.orderWindowStart;
		const endBase = new Date(
			Number(todayStr.slice(0, 4)),
			Number(todayStr.slice(5, 7)) - 1,
			Number(todayStr.slice(8, 10)),
			0,
			0,
		);
		const endDate = isOvernight
			? new Date(endBase.getTime() + 86400000)
			: endBase;
		const endDateStr = `${endDate.getFullYear()}-${endDate.getMonth() + 1 < 10 ? "0" : ""}${endDate.getMonth() + 1}-${endDate.getDate() < 10 ? "0" : ""}${endDate.getDate()}`;
		const orderEnd = new Date(`${endDateStr}T${explicit.orderWindowEnd}`);
			if (new Date() > orderEnd) {
				throw validationError("This order window has ended.");
			}
			const paused = await isBatchPausedForToday(deliveryWindowId, scheduledDate);
			if (paused) {
				throw validationError("This batch is paused for today. Resume it or choose another.");
			}
			const capacity = await getDeliveryWindowCapacity({
				deliveryWindowId,
				date: scheduledDate,
				maxCapacity: explicit.capacity,
			});
			if (capacity.remainingQuantity <= 0) {
				throw validationError("This delivery window is fully booked.");
			}
			const batches = await listStickerBatchesByVendorDB({ vendorId });
			const activeBatch = batches.find((b) => b.status === "ACTIVE");
			batchId = activeBatch?._id ?? undefined;
		}
	}

	const { items, marketplaceCategories } =
		await buildSnapshotItemsWithMealTimes({
			vendorId,
			items: input.items,
		});

	const created = await createDailyOrderDB({
		payload: {
			vendorId,
			campusId: vendor.campusId.toString(),
			shareableToken: generateShareableToken(),
			title: input.title,
			scheduledDate,
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
			marketplaceCategories: marketplaceCategories as import("@/server/models").MealTime[],
			mode,
			deliveryWindowId,
			batchId,
		},
	});
	if (!created) throw ErrForbidden;

	const id = created._id.toString();
	if (!input.draft && mode === "A" && deliveryWindowId) {
		const totalQty = items.reduce(
			(sum, it) => sum + (it.maxQuantity ?? 1),
			0,
		);
		const result = await reserveBatchCapacity({
			windowId: deliveryWindowId,
			date: scheduledDate,
			quantity: totalQty,
			orderId: id,
		});
		if (!result.ok) {
			throw validationError(
				"This batch was paused before your order could be saved. Please try another.",
			);
		}
	}

	if (!input.draft) {
		await setDailyOrderStatusDB({
			id,
			vendorId,
			status: DailyOrderStatus.ACTIVE,
		});
	}

	return (await getDailyOrderByIdDB({ id })) ?? created;
}
