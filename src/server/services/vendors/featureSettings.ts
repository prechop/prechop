import {
	getSiteConfigs,
} from "@/server/services/siteConfigs";
import {
	getVendorProfileByUserIdDB,
	updateVendorProfileDB,
	type IVendorProfile,
} from "@/server/models";

function clampToPlatform(
	vendorValue: boolean,
	platformValue: boolean,
	_defaultValue: boolean,
): boolean {
	if (!platformValue) return false;
	return vendorValue;
}

export async function getVendorFeatureSettings({
	userId,
}: {
	userId: string;
}): Promise<{
	scheduleAhead: boolean;
	weeklyBreakfastPlan: boolean;
	delivery: boolean;
	pickup: boolean;
	breakfastEnabled: boolean;
	lunchEnabled: boolean;
	dinnerEnabled: boolean;
}> {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) return { scheduleAhead: false, weeklyBreakfastPlan: false, delivery: false, pickup: true, breakfastEnabled: true, lunchEnabled: true, dinnerEnabled: true };
	const configs = await getSiteConfigs();
	return {
		scheduleAhead: clampToPlatform(
			vendor.featureScheduleAhead ?? false,
			configs.scheduleAheadEnabled,
			false,
		),
		weeklyBreakfastPlan: clampToPlatform(
			vendor.featureWeeklyBreakfastPlan ?? false,
			configs.weeklyBreakfastPlanEnabled,
			false,
		),
		delivery: clampToPlatform(
			vendor.featureDelivery ?? false,
			configs.deliveryEnabled,
			false,
		),
		pickup: clampToPlatform(
			vendor.featurePickup ?? true,
			configs.pickupEnabled,
			true,
		),
		breakfastEnabled: clampToPlatform(
			vendor.breakfastEnabled ?? true,
			configs.breakfastEnabled,
			true,
		),
		lunchEnabled: clampToPlatform(
			vendor.lunchEnabled ?? true,
			configs.lunchEnabled,
			true,
		),
		dinnerEnabled: clampToPlatform(
			vendor.dinnerEnabled ?? true,
			configs.dinnerEnabled,
			true,
		),
	};
}

export async function updateVendorFeatureSettings({
	userId,
	scheduleAhead,
	weeklyBreakfastPlan,
	delivery,
	pickup,
	breakfastEnabled,
	lunchEnabled,
	dinnerEnabled,
}: {
	userId: string;
	scheduleAhead?: boolean;
	weeklyBreakfastPlan?: boolean;
	delivery?: boolean;
	pickup?: boolean;
	breakfastEnabled?: boolean;
	lunchEnabled?: boolean;
	dinnerEnabled?: boolean;
}): Promise<{
	scheduleAhead: boolean;
	weeklyBreakfastPlan: boolean;
	delivery: boolean;
	pickup: boolean;
	breakfastEnabled: boolean;
	lunchEnabled: boolean;
	dinnerEnabled: boolean;
}> {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw new Error("Vendor profile not found");

	const configs = await getSiteConfigs();

	const updates: Record<string, boolean> = {};
	if (scheduleAhead !== undefined && configs.scheduleAheadEnabled) {
		updates.featureScheduleAhead = scheduleAhead;
	}
	if (weeklyBreakfastPlan !== undefined && configs.weeklyBreakfastPlanEnabled) {
		updates.featureWeeklyBreakfastPlan = weeklyBreakfastPlan;
	}
	if (delivery !== undefined && configs.deliveryEnabled) {
		updates.featureDelivery = delivery;
	}
	if (pickup !== undefined && configs.pickupEnabled) {
		updates.featurePickup = pickup;
	}
	if (breakfastEnabled !== undefined && configs.breakfastEnabled) {
		updates.breakfastEnabled = breakfastEnabled;
	}
	if (lunchEnabled !== undefined && configs.lunchEnabled) {
		updates.lunchEnabled = lunchEnabled;
	}
	if (dinnerEnabled !== undefined && configs.dinnerEnabled) {
		updates.dinnerEnabled = dinnerEnabled;
	}

	await updateVendorProfileDB({
		id: vendor._id.toString(),
		payload: updates,
	});

	return getVendorFeatureSettings({ userId });
}
