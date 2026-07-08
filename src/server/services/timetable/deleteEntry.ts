import { ErrResourceNotFound } from "@/server/constants";
import { deleteTimetableEntryDB } from "@/server/models";
import { resolveVendorByUserId, vendorIdOf } from "@/server/services/vendors";

export async function deleteTimetableEntry({
	userId,
	id,
}: {
	userId: string;
	id: string;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const deleted = await deleteTimetableEntryDB({
		id,
		vendorId: vendorIdOf(vendor),
	});
	if (!deleted) throw ErrResourceNotFound;
	return { deleted: true };
}
