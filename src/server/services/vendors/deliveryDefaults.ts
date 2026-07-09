import { type IVendorProfile, updateVendorProfileDB } from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";

export interface DeliveryDefaultsInput {
	defaultPickupAvailable: boolean;
	defaultDeliveryAvailable: boolean;
	defaultDeliveryFeeKobo: number;
}

/**
 * Persist the fulfilment defaults that pre-fill the daily-order composer.
 */
export async function updateDeliveryDefaults({
	userId,
	defaults,
}: {
	userId: string;
	defaults: DeliveryDefaultsInput;
}): Promise<IVendorProfile | null> {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);

	return updateVendorProfileDB({
		id: vendorId,
		payload: {
			defaultPickupAvailable: defaults.defaultPickupAvailable,
			defaultDeliveryAvailable: defaults.defaultDeliveryAvailable,
			defaultDeliveryFeeKobo: defaults.defaultDeliveryFeeKobo,
		},
	});
}
