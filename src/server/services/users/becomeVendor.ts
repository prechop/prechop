import {
	AppError,
	BUYERS_GROUP,
	conflict,
	ErrUserNotFound,
	VENDORS_GROUP,
} from "@/server/constants";
import {
	addUserToGroupDB,
	createVendorProfileDB,
	getUserByIdDB,
	getVendorProfileByUserIdDB,
	updateVendorProfileDB,
} from "@/server/models";
import type { BecomeVendorInput } from "@/server/validators/vendors/validate";
import { recordAudit } from "../audit";
import { getBuiltInGroupId } from "../iam";
import { recomputeVendorCompleteness } from "../vendors/recomputeVendorCompleteness";

export async function becomeVendor({
	userId,
	input,
}: {
	userId: string;
	input: BecomeVendorInput;
}) {
	const user = await getUserByIdDB({ id: userId });
	if (!user) throw ErrUserNotFound;

	const existingVendor = await getVendorProfileByUserIdDB({ userId });
	const buyersGroupId = await getBuiltInGroupId(BUYERS_GROUP);
	if (
		buyersGroupId &&
		!user.groupIds.map((g) => g.toString()).includes(buyersGroupId)
	) {
		throw new AppError(
			"Only buyer accounts can apply to become a vendor from account settings.",
			403,
			"NOT_BUYER_ACCOUNT",
		);
	}

	const vendorsGroupId = await getBuiltInGroupId(VENDORS_GROUP);
	if (existingVendor) {
		const vendorId = existingVendor._id.toString();
		await updateVendorProfileDB({
			id: vendorId,
			payload: {
				businessName: input.businessName,
				vendorType: input.vendorType,
				...input.location,
			},
		});
		if (vendorsGroupId) {
			await addUserToGroupDB({ id: userId, groupId: vendorsGroupId });
		}
		await recomputeVendorCompleteness({ vendorId, userId });
		return getVendorProfileByUserIdDB({ userId });
	}

	const vendor = await createVendorProfileDB({
		payload: {
			userId,
			campusId: user.campusId.toString(),
			email: `buyer-${userId}@upgrade.prechop.local`,
			businessName: input.businessName,
			vendorType: input.vendorType,
		},
	});
	if (!vendor)
		throw conflict("Could not create a vendor profile for this account.");

	const vendorId = vendor._id.toString();
	await updateVendorProfileDB({
		id: vendorId,
		payload: input.location,
	});
	if (vendorsGroupId) {
		await addUserToGroupDB({ id: userId, groupId: vendorsGroupId });
	}
	await recomputeVendorCompleteness({ vendorId, userId });
	await recordAudit({
		userId,
		role: BUYERS_GROUP,
		action: "BUYER_BECOME_VENDOR",
		resourceType: "vendorProfiles",
		resourceId: vendorId,
		newState: {
			businessName: input.businessName,
			vendorType: input.vendorType,
			locationType: input.location.locationType,
		},
	});

	return getVendorProfileByUserIdDB({ userId });
}
