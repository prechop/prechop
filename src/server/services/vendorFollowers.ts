import {
	countNewVendorFollowersDB,
	countVendorFollowersDB,
	createVendorFollowerDB,
	deleteVendorFollowerDB,
	getVendorFollowerDB,
	listFollowedVendorIdsDB,
	listVendorFollowersDB,
} from "@/server/models/vendorFollowers";
import { getVendorProfileByIdDB } from "@/server/models/vendorProfiles";
import { VendorStatus } from "@/server/models/enums";

export interface VendorFollowInput {
	buyerId: string;
	vendorId: string;
}

export async function followVendor({
	buyerId,
	vendorId,
}: VendorFollowInput): Promise<{ followed: boolean; alreadyFollowed: boolean }> {
	const vendor = await getVendorProfileByIdDB({ id: vendorId });
	if (!vendor || vendor.status !== VendorStatus.ACTIVE) {
		throw new Error("VENDOR_NOT_FOUND");
	}

	const existing = await getVendorFollowerDB({ buyerId, vendorId });
	if (existing) {
		return { followed: true, alreadyFollowed: true };
	}

	const follower = await createVendorFollowerDB({ buyerId, vendorId });
	return { followed: !!follower, alreadyFollowed: false };
}

export async function unfollowVendor({
	buyerId,
	vendorId,
}: VendorFollowInput): Promise<{ unfollowed: boolean }> {
	const removed = await deleteVendorFollowerDB({ buyerId, vendorId });
	return { unfollowed: removed };
}

export async function getVendorFollowerCount({
	vendorId,
}: {
	vendorId: string;
}): Promise<{ count: number; newThisWeek: number }> {
	const [count, newThisWeek] = await Promise.all([
		countVendorFollowersDB({ vendorId }),
		countNewVendorFollowersDB({
			vendorId,
			since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
		}),
	]);
	return { count, newThisWeek };
}

export async function getBuyerFollowedVendorIds({
	buyerId,
}: {
	buyerId: string;
}): Promise<string[]> {
	return listFollowedVendorIdsDB({ buyerId });
}

export async function isBuyerFollowingVendor({
	buyerId,
	vendorId,
}: {
	buyerId: string;
	vendorId: string;
}): Promise<boolean> {
	const follower = await getVendorFollowerDB({ buyerId, vendorId });
	return !!follower;
}
