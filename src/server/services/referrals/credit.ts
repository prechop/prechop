import {
	createReferralAuditLogDB,
	createReferralDB,
	hasReferredUserInCampaignDB,
} from "@/server/models";
import { getActiveCampaign } from "./campaign";
import { checkDeviceCollision, checkIpCollision, hashIp } from "./fraud";

export type CreditOutcome =
	| "accepted"
	| "flagged_ip"
	| "flagged_device"
	| "rejected";

export interface CreditReferralInput {
	vendorId: string;
	creatorUserId: string;
	referredUserId: string;
	buyerOrderId: string;
	ip: string;
	deviceId?: string;
}

export interface CreditReferralResult {
	outcome: CreditOutcome;
	reason?: string;
}

function reject(
	reason: string,
): { outcome: "rejected"; reason: string } {
	return { outcome: "rejected", reason };
}

function flag(
	outcome: "flagged_ip" | "flagged_device",
	reason: string,
): { outcome: "flagged_ip" | "flagged_device"; reason: string } {
	return { outcome, reason };
}

export async function creditReferralIfEligible({
	vendorId,
	creatorUserId,
	referredUserId,
	buyerOrderId,
	ip,
	ipHash: providedIpHash,
	deviceId,
}: CreditReferralInput & { ipHash?: string }): Promise<CreditReferralResult> {
	const campaign = await getActiveCampaign({ vendorId });
	const checkedAt = new Date();
	const ipHash = providedIpHash ?? hashIp(ip);

	const auditLogInput = {
		vendorId,
		creatorUserId,
		referredUserId,
		buyerOrderId,
		campaignId: campaign ? campaign._id.toString() : "",
		ipHash,
		deviceId,
		checkedAt,
	};

	if (!campaign) {
		const result = reject("CAMPAIGN_INACTIVE");
		await createReferralAuditLogDB({
			payload: { ...auditLogInput, outcome: result.outcome, reason: result.reason },
		});
		return result;
	}

	const campaignId = campaign._id.toString();

	const alreadyCredited = await hasReferredUserInCampaignDB({
		campaignId,
		referredUserId,
	});
	if (alreadyCredited) {
		const result = reject("ALREADY_CREDITED");
		await createReferralAuditLogDB({
			payload: { ...auditLogInput, outcome: result.outcome, reason: result.reason, campaignId },
		});
		return result;
	}

	if (creatorUserId === referredUserId) {
		const result = reject("SELF_REFERRAL");
		await createReferralAuditLogDB({
			payload: { ...auditLogInput, outcome: result.outcome, reason: result.reason, campaignId },
		});
		return result;
	}

	const ipCollision = await checkIpCollision({
		vendorId,
		creatorUserId,
		campaignId,
		ipHash,
		excludeBuyerOrderId: buyerOrderId,
	});

	const deviceCollision = deviceId
		? await checkDeviceCollision({
				vendorId,
				creatorUserId,
				campaignId,
				deviceId,
				excludeBuyerOrderId: buyerOrderId,
			})
		: null;

	if (ipCollision && deviceCollision) {
		const result = reject("IP_AND_DEVICE_COLLISION");
		await createReferralAuditLogDB({
			payload: { ...auditLogInput, outcome: result.outcome, reason: result.reason, campaignId },
		});
		return result;
	}

	if (ipCollision) {
		const result = flag("flagged_ip", "IP_COLLISION");
		await createReferralAuditLogDB({
			payload: { ...auditLogInput, outcome: result.outcome, reason: result.reason, campaignId },
		});
		await createReferralDB({
			payload: {
				vendorId,
				creatorUserId,
				referredUserId,
				buyerOrderId,
				campaignId,
				ipHash,
				deviceId,
			},
		});
		return result;
	}

	if (deviceCollision) {
		const result = flag("flagged_device", "DEVICE_COLLISION");
		await createReferralAuditLogDB({
			payload: { ...auditLogInput, outcome: result.outcome, reason: result.reason, campaignId },
		});
		await createReferralDB({
			payload: {
				vendorId,
				creatorUserId,
				referredUserId,
				buyerOrderId,
				campaignId,
				ipHash,
				deviceId,
			},
		});
		return result;
	}

	await createReferralAuditLogDB({
		payload: { ...auditLogInput, outcome: "accepted", campaignId },
	});
	await createReferralDB({
		payload: {
			vendorId,
			creatorUserId,
			referredUserId,
			buyerOrderId,
			campaignId,
			ipHash,
			deviceId,
		},
	});

	return { outcome: "accepted" };
}
