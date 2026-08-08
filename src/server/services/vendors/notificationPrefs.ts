import { type IVendorProfile, updateVendorProfileDB } from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";

export interface NotificationPrefsInput {
	notifyNewOrders?: boolean;
	notifyPayouts?: boolean;
	notifyReviews?: boolean;
	notifyFollowers?: boolean;
	notifyFollowerMilestones?: boolean;
}

/**
 * Update a vendor's notification opt-ins. Only the keys present in `prefs` are
 * changed, so a partial update leaves the others untouched.
 */
export async function updateNotificationPrefs({
	userId,
	prefs,
}: {
	userId: string;
	prefs: NotificationPrefsInput;
}): Promise<IVendorProfile | null> {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);

	const payload: Partial<IVendorProfile> = {};
	if (typeof prefs.notifyNewOrders === "boolean")
		payload.notifyNewOrders = prefs.notifyNewOrders;
	if (typeof prefs.notifyPayouts === "boolean")
		payload.notifyPayouts = prefs.notifyPayouts;
	if (typeof prefs.notifyReviews === "boolean")
		payload.notifyReviews = prefs.notifyReviews;
	if (typeof prefs.notifyFollowers === "boolean")
		payload.notifyFollowers = prefs.notifyFollowers;
	if (typeof prefs.notifyFollowerMilestones === "boolean")
		payload.notifyFollowerMilestones = prefs.notifyFollowerMilestones;

	return updateVendorProfileDB({ id: vendorId, payload });
}
