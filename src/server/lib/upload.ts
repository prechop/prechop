import "server-only";
import { s3Provider } from "../providers";

/** Presign a direct-to-S3 image upload for menu items / vendor profiles. */
export async function presignImageUpload({
	folder,
	mimeType,
}: {
	folder: "menu-items" | "vendor-profiles";
	mimeType: string;
}) {
	return s3Provider.getPresignedUploadUrl(folder, mimeType);
}
