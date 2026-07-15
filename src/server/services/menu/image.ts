import { ErrMenuItemNotFound } from "@/server/constants";
import { getMenuItemByIdDB, updateMenuItemDB } from "@/server/models";
import { s3Provider } from "@/server/providers";
import { resolveVendorByUserId, vendorIdOf } from "@/server/services/vendors";

export async function presignMenuItemImage({
	userId,
	itemId,
	mimeType,
}: {
	userId: string;
	itemId: string;
	mimeType: string;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const item = await getMenuItemByIdDB({ id: itemId });
	if (!item || String(item.vendorId) !== vendorIdOf(vendor)) {
		throw ErrMenuItemNotFound;
	}
	return s3Provider.getPresignedUploadUrl("menu-items", mimeType);
}

export async function confirmMenuItemImage({
	userId,
	itemId,
	imageUrl,
	key,
}: {
	userId: string;
	itemId: string;
	imageUrl?: string;
	key?: string;
}) {
	const vendor = await resolveVendorByUserId({ userId });
	const nextImageUrl = key ? imageProxyUrl(key) : imageUrl;
	const updated = await updateMenuItemDB({
		id: itemId,
		vendorId: vendorIdOf(vendor),
		payload: { imageUrl: nextImageUrl },
	});
	if (!updated) throw ErrMenuItemNotFound;
	return updated;
}

function imageProxyUrl(key: string): string {
	return `/api/images/${key
		.split("/")
		.map((part) => encodeURIComponent(part))
		.join("/")}`;
}
