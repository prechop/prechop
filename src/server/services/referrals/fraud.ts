import { hash } from "@/server/constants";
import {
	findDeviceCollisionDB,
	findIpCollisionDB,
	type IReferral,
} from "@/server/models/referrals";

export function hashIp(ip: string): string {
	return hash(ip.trim());
}

export async function checkIpCollision({
	vendorId,
	creatorUserId,
	campaignId,
	ipHash,
	excludeBuyerOrderId,
}: {
	vendorId: string;
	creatorUserId: string;
	campaignId: string;
	ipHash: string;
	excludeBuyerOrderId: string;
}): Promise<IReferral | null> {
	return findIpCollisionDB({
		vendorId,
		creatorUserId,
		campaignId,
		ipHash,
		excludeBuyerOrderId,
	});
}

export async function checkDeviceCollision({
	vendorId,
	creatorUserId,
	campaignId,
	deviceId,
	excludeBuyerOrderId,
}: {
	vendorId: string;
	creatorUserId: string;
	campaignId: string;
	deviceId: string;
	excludeBuyerOrderId: string;
}): Promise<IReferral | null> {
	return findDeviceCollisionDB({
		vendorId,
		creatorUserId,
		campaignId,
		deviceId,
		excludeBuyerOrderId,
	});
}
