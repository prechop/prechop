import {
	type IVendorProfile,
	LocationType,
	updateVendorProfileDB,
} from "@/server/models";
import { recomputeVendorCompleteness } from "./recomputeVendorCompleteness";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";

export type UpdateLocationInput =
	| {
			locationType: LocationType.ON_CAMPUS;
			schoolId?: string;
			schoolNameOther?: string;
			hostelOrStallName: string;
	  }
	| {
			locationType: LocationType.OFF_CAMPUS;
			state: string;
			areaOrAddress: string;
	  };

export async function updateVendorLocation({
	userId,
	input,
}: {
	userId: string;
	input: UpdateLocationInput;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);

	const payload: Partial<IVendorProfile> = {
		locationType: input.locationType,
	};
	if (input.locationType === LocationType.ON_CAMPUS) {
		payload.schoolId = input.schoolId;
		payload.schoolNameOther = input.schoolNameOther;
		payload.hostelOrStallName = input.hostelOrStallName;
	} else {
		payload.state = input.state;
		payload.areaOrAddress = input.areaOrAddress;
	}

	const updated = await updateVendorProfileDB({ id: vendorId, payload });
	await recomputeVendorCompleteness({ vendorId, userId });
	return updated;
}
