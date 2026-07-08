import { updateVendorProfileDB } from "@/server/models";
import { s3Provider } from "@/server/providers";
import { recomputeVendorCompleteness } from "./recomputeVendorCompleteness";
import { resolveVendorByUserId, vendorIdOf } from "./resolveVendor";

export async function presignProfileImage({
	userId,
	mimeType,
}: {
	userId: string;
	mimeType: string;
}) {
	await resolveVendorByUserId({ userId });
	return s3Provider.getPresignedUploadUrl("vendor-profiles", mimeType);
}

export async function confirmProfileImage({
	userId,
	imageUrl,
}: {
	userId: string;
	imageUrl: string;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const vendorId = vendorIdOf(vendor);

	const updated = await updateVendorProfileDB({
		id: vendorId,
		payload: { profileImageUrl: imageUrl },
	});
	await recomputeVendorCompleteness({ vendorId, userId });
	return updated;
}
