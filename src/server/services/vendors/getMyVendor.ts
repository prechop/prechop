import type { IVendorProfile } from "@/server/models";
import { resolveVendorByUserId } from "./resolveVendor";

export async function getMyVendorProfile({
	userId,
}: {
	userId: string;
}): Promise<IVendorProfile> {
	return resolveVendorByUserId({ userId });
}
