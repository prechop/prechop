import {
	AppError,
	BUYERS_GROUP,
	conflict,
	ErrUserNotFound,
	tryDecrypt,
} from "@/server/constants";
import {
	createVendorProfileDB,
	getUserByIdDB,
	getVendorProfileByUserIdDB,
	updateVendorProfileDB,
} from "@/server/models";
import type { BecomeVendorInput } from "@/server/validators/vendors/validate";
import { recordAudit } from "../audit";
import { getBuiltInGroupId } from "../iam";
import { recomputeVendorCompleteness } from "../vendors/recomputeVendorCompleteness";

export async function startVendorApplication({ userId }: { userId: string }) {
	const user = await getUserByIdDB({ id: userId });
	if (!user) throw ErrUserNotFound;

	const buyersGroupId = await getBuiltInGroupId(BUYERS_GROUP);
	if (
		buyersGroupId &&
		!user.groupIds.map((g) => g.toString()).includes(buyersGroupId)
	) {
		throw new AppError(
			"Only buyer accounts can apply to become a vendor.",
			403,
			"NOT_BUYER_ACCOUNT",
		);
	}

	const existingVendor = await getVendorProfileByUserIdDB({ userId });
	if (existingVendor) {
		// An older initialization path copied the user's encrypted-at-rest phone
		// into the vendor's plain contact field. Repair that value on read so
		// affected incomplete applications display the real number immediately.
		const contactPhone = tryDecrypt(existingVendor.contactPhone);
		if (contactPhone && contactPhone !== existingVendor.contactPhone) {
			return (
				(await updateVendorProfileDB({
					id: existingVendor._id.toString(),
					payload: { contactPhone },
				})) ?? existingVendor
			);
		}
		return existingVendor;
	}

	const vendor = await createVendorProfileDB({
		payload: {
			userId,
			...(user.campusId ? { campusId: user.campusId.toString() } : {}),
			email: vendorDraftEmail(user),
			...(user.phone ? { contactPhone: user.phone } : {}),
		},
	});
	if (!vendor) {
		// Creating a vendor application is idempotent. In development React
		// Strict Mode may issue this request twice, and real clients can retry as
		// well. If another request won the unique-user race, return its profile.
		const concurrentlyCreatedVendor = await getVendorProfileByUserIdDB({
			userId,
		});
		if (concurrentlyCreatedVendor) return concurrentlyCreatedVendor;
		throw conflict(
			"Could not create a vendor application for this account.",
		);
	}

	await recordAudit({
		userId,
		role: BUYERS_GROUP,
		action: "BUYER_START_VENDOR_APPLICATION",
		resourceType: "vendorProfiles",
		resourceId: vendor._id.toString(),
	});
	return vendor;
}

export async function becomeVendor({
	userId,
	input,
}: {
	userId: string;
	input: BecomeVendorInput;
}) {
	const vendor = await startVendorApplication({ userId });
	const vendorId = vendor._id.toString();
	const user = await getUserByIdDB({ id: userId });
	if (!user) throw ErrUserNotFound;

	await updateVendorProfileDB({
		id: vendorId,
		payload: {
			businessName: input.businessName,
			vendorType: input.vendorType,
			email: input.email ?? vendor.email ?? vendorDraftEmail(user),
			contactPhone:
				input.contactPhone ?? vendor.contactPhone ?? user.phone,
			...(input.location ?? {}),
		},
	});
	await recomputeVendorCompleteness({ vendorId, userId });
	await recordAudit({
		userId,
		role: BUYERS_GROUP,
		action: "BUYER_UPDATE_VENDOR_APPLICATION",
		resourceType: "vendorProfiles",
		resourceId: vendorId,
		newState: {
			businessName: input.businessName,
			vendorType: input.vendorType,
			locationType: input.location?.locationType,
		},
	});

	return getVendorProfileByUserIdDB({ userId });
}

function vendorDraftEmail(user: { _id: string; email?: string }) {
	return `vendor-${user._id.toString()}@draft.prechop.local`;
}
