import crypto from "node:crypto";
import {
	createReferralCampaignDB,
	endReferralCampaignDB,
	getReferralCampaignByVendorDB,
	updateReferralCampaignDB,
	type IReferralCampaign,
	type IReferralCampaignCreateInput,
} from "@/server/models";
import { getVendorProfileByIdDB } from "@/server/models";
import { validationError } from "@/server/constants";

function generateToken(): string {
	return crypto.randomBytes(32).toString("base64url");
}

export async function getActiveCampaign({
	vendorId,
}: {
	vendorId: string;
}): Promise<IReferralCampaign | null> {
	const campaign = await getReferralCampaignByVendorDB({ vendorId });
	if (!campaign || !campaign.isActive) return null;
	const now = new Date();
	if (now < campaign.startDate || now > campaign.endDate) return null;
	return campaign;
}

export async function getOrCreateCampaign({
	vendorId,
}: {
	vendorId: string;
}): Promise<IReferralCampaign> {
	const existing = await getReferralCampaignByVendorDB({ vendorId });
	if (existing) return existing;

	const vendor = await getVendorProfileByIdDB({ id: vendorId });
	if (!vendor) throw validationError("Vendor not found");

	const now = new Date();
	const startDate = now;
	const endDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

	const input: IReferralCampaignCreateInput = {
		vendorId,
		isActive: true,
		startDate,
		endDate,
		threshold: 10,
		rewardExpiryDays: 30,
		rewardType: "FREE_MEAL",
		maxRewardsPerCreator: null,
	};

	const created = await createReferralCampaignDB({ payload: input });
	if (!created) throw new Error("Failed to create referral campaign");
	return created;
}

export async function updateCampaignSettings({
	vendorId,
	...settings
}: {
	vendorId: string;
	isActive?: boolean;
	threshold?: number;
	rewardExpiryDays?: number;
	rewardType?: "FREE_MEAL" | "PERCENT_DISCOUNT" | "FIXED_CREDIT";
	rewardValue?: number;
	maxRewardsPerCreator?: number | null;
	endDate?: Date;
}): Promise<IReferralCampaign> {
	const existing = await getReferralCampaignByVendorDB({ vendorId });
	if (!existing) {
		throw new Error("Referral campaign not found");
	}

	const updates: Record<string, unknown> = {};
	if (settings.isActive !== undefined) updates.isActive = settings.isActive;
	if (settings.threshold !== undefined) updates.threshold = Math.max(1, settings.threshold);
	if (settings.rewardExpiryDays !== undefined) updates.rewardExpiryDays = Math.max(1, settings.rewardExpiryDays);
	if (settings.rewardType !== undefined) updates.rewardType = settings.rewardType;
	if (settings.rewardValue !== undefined) updates.rewardValue = settings.rewardValue;
	if (settings.maxRewardsPerCreator !== undefined) updates.maxRewardsPerCreator = settings.maxRewardsPerCreator;
	if (settings.endDate !== undefined) updates.endDate = settings.endDate;

	const updated = await updateReferralCampaignDB({ vendorId, payload: updates });
	if (!updated) throw new Error("Failed to update referral campaign");
	return updated;
}

export async function endCampaign({
	vendorId,
}: {
	vendorId: string;
}): Promise<IReferralCampaign> {
	const updated = await endReferralCampaignDB({ vendorId });
	if (!updated) throw new Error("Failed to end referral campaign");
	return updated;
}
