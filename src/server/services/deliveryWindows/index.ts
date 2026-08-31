import { ErrVendorNotActive, validationError } from "@/server/constants";
import {
	createDeliveryWindowDB,
	deleteDeliveryWindowDB,
	getDeliveryWindowByIdDB,
	listDeliveryWindowsByVendorDB,
	updateDeliveryWindowDB,
} from "@/server/models/deliveryWindows";
import {
	getSiteConfigs,
	assertMealTimeEnabled,
} from "@/server/services/siteConfigs";
import { resolveVendorByUserId, vendorIdOf } from "@/server/services/vendors";
import { VendorStatus, MealTime } from "@/server/models/enums";

function timeToMinutes(time: string): number {
	const [hours, minutes] = time.split(":").map(Number);
	return hours * 60 + minutes;
}

export async function createDeliveryWindow({
	userId,
	name,
	mealTime,
	orderWindowStart,
	orderWindowEnd,
	deliveryWindowStart,
	deliveryWindowEnd,
	capacity,
	active,
}: {
	userId: string;
	name?: string;
	mealTime: MealTime;
	orderWindowStart: string;
	orderWindowEnd: string;
	deliveryWindowStart: string;
	deliveryWindowEnd: string;
	capacity: number;
	active?: boolean;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);
	if (vendor.status !== VendorStatus.ACTIVE) throw ErrVendorNotActive;

	const configs = await getSiteConfigs();
	if (!assertMealTimeEnabled(configs, mealTime)) {
		throw validationError(
			`${mealTime.toLowerCase()} is not enabled platform-wide.`,
		);
	}
	if (orderWindowEnd === orderWindowStart) {
		throw validationError("Order window end must be after start.");
	}
	if (deliveryWindowEnd === deliveryWindowStart) {
		throw validationError("Delivery window end must be after start.");
	}
	if (orderWindowEnd > deliveryWindowStart) {
		throw validationError(
			"Order window end must be at or before delivery window start.",
		);
	}
	if (capacity < 1) {
		throw validationError("Capacity must be at least 1.");
	}

	const existing = await listDeliveryWindowsByVendorDB({ vendorId });
	const overlapping = existing.filter((w) => {
		if (w.mealTime !== mealTime || !w.active) return false;
		const newDeliveryStart = timeToMinutes(deliveryWindowStart);
		const newDeliveryEnd = timeToMinutes(deliveryWindowEnd);
		const existDeliveryStart = timeToMinutes(w.deliveryWindowStart);
		const existDeliveryEnd = timeToMinutes(w.deliveryWindowEnd);
		return newDeliveryStart < existDeliveryEnd && newDeliveryEnd > existDeliveryStart;
	});
	if (overlapping.length > 0) {
		throw validationError(
			"Delivery windows must not overlap with another active window for the same meal time.",
		);
	}

	return createDeliveryWindowDB({
		payload: {
			vendorId,
			name,
			mealTime,
			orderWindowStart,
			orderWindowEnd,
			deliveryWindowStart,
			deliveryWindowEnd,
			capacity,
			active: active ?? true,
		},
	});
}

export async function updateDeliveryWindow({
	userId,
	id,
	...input
}: {
	userId: string;
	id: string;
} & Partial<Parameters<typeof createDeliveryWindowDB>[0]["payload"]>) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);
	if (vendor.status !== VendorStatus.ACTIVE) throw ErrVendorNotActive;

	if (input.mealTime && input.mealTime !== undefined) {
		const configs = await getSiteConfigs();
		if (!assertMealTimeEnabled(configs, input.mealTime)) {
			throw validationError(
				`${input.mealTime.toLowerCase()} is not enabled platform-wide.`,
			);
		}
	}
	const orderStart = input.orderWindowStart;
	const orderEnd = input.orderWindowEnd;
	if (orderEnd && orderStart && orderEnd === orderStart) {
		throw validationError("Order window end must be after start.");
	}
	const deliveryStart = input.deliveryWindowStart;
	const deliveryEnd = input.deliveryWindowEnd;
	if (deliveryEnd && deliveryStart && deliveryEnd === deliveryStart) {
		throw validationError("Delivery window end must be after start.");
	}
	if (orderEnd && deliveryStart && orderEnd > deliveryStart) {
		throw validationError(
			"Order window end must be at or before delivery window start.",
		);
	}
	if (input.capacity !== undefined && input.capacity < 1) {
		throw validationError("Capacity must be at least 1.");
	}

	const updated = await updateDeliveryWindowDB({
		id,
		vendorId,
		payload: input,
	});
	if (!updated) throw Error("Delivery window not found");

	if (
		input.orderWindowStart ||
		input.orderWindowEnd ||
		input.mealTime ||
		input.active !== undefined
	) {
		const allWindows = await listDeliveryWindowsByVendorDB({ vendorId });
		const mealTime = updated.mealTime;
		const deliveryStartFinal =
			input.deliveryWindowStart ?? updated.deliveryWindowStart;
		const deliveryEndFinal =
			input.deliveryWindowEnd ?? updated.deliveryWindowEnd;
		const overlapping = allWindows.filter((w) => {
			if (w._id === updated._id) return false;
			if (w.mealTime !== mealTime || !w.active) return false;
			const newStart = timeToMinutes(deliveryStartFinal);
			const newEnd = timeToMinutes(deliveryEndFinal);
			const existStart = timeToMinutes(w.deliveryWindowStart);
			const existEnd = timeToMinutes(w.deliveryWindowEnd);
			return newStart < existEnd && newEnd > existStart;
		});
		if (overlapping.length > 0) {
			throw validationError(
				"Delivery windows must not overlap with another active window for the same meal time.",
			);
		}
	}

	return updated;
}

export async function deleteDeliveryWindow({
	userId,
	id,
}: {
	userId: string;
	id: string;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);
	if (vendor.status !== VendorStatus.ACTIVE) throw ErrVendorNotActive;
	const deleted = await deleteDeliveryWindowDB({ id, vendorId });
	if (!deleted) throw Error("Delivery window not found");
	return true;
}

export async function getMyDeliveryWindows({
	userId,
}: {
	userId: string;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);
	return listDeliveryWindowsByVendorDB({ vendorId });
}

export async function getDeliveryWindowForVendor({
	id,
	userId,
}: {
	id: string;
	userId: string;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);
	const window = await getDeliveryWindowByIdDB({ id });
	if (!window || window.vendorId !== vendorId) {
		throw Error("Delivery window not found");
	}
	return window;
}

export * from "./capacity";
