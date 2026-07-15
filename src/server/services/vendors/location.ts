import { ErrVendorNotFound, validationError } from "@/server/constants";
import {
	type IVendorProfile,
	LocationType,
	listCampusesDB,
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
			campusIds: string[];
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
		payload.campusIds = [];
	} else {
		const selectedCampusIds = [...new Set(input.campusIds)];
		if (selectedCampusIds.length > 3) {
			throw validationError("Select up to 3 campuses.");
		}
		const campuses = await listCampusesDB({
			activeOnly: true,
			state: input.state,
		});
		const allowedIds = new Set(
			campuses.map((c) => (c.id ?? c._id).toString()),
		);
		if (
			selectedCampusIds.length === 0 ||
			selectedCampusIds.some((id) => !allowedIds.has(id))
		) {
			throw validationError(
				"Select campuses available in your chosen state.",
			);
		}
		payload.state = input.state;
		payload.areaOrAddress = input.areaOrAddress;
		payload.campusIds = selectedCampusIds;
	}

	const updated = await updateVendorProfileDB({ id: vendorId, payload });
	if (!updated) throw ErrVendorNotFound;
	await recomputeVendorCompleteness({ vendorId, userId });
	return updated;
}
