import {
	countReferralsByCreatorDB,
	getReferralsByCreatorDB,
} from "@/server/models/referrals";
import {
	countRedeemedRewardsByCreatorDB,
	createReferralRewardDB,
	getAvailableRewardsByCreatorDB,
	redeemReferralRewardDB,
	type IReferralReward,
} from "@/server/models/referralRewards";
import {
	getActiveCampaign,
} from "@/server/services/referrals/campaign";

export async function getCreatorDashboard({
	vendorId,
	creatorUserId,
}: {
	vendorId: string;
	creatorUserId: string;
}): Promise<{
	totalReferrals: number;
	rewardsUnlocked: number;
	rewardsRedeemed: number;
	availableRewards: IReferralReward[];
	progressToNext: { current: number; needed: number };
	campaignEndDate: Date | null;
}> {
	const [totalReferrals, rewardsUnlocked, rewardsRedeemed, availableRewards] =
		await Promise.all([
			countReferralsByCreatorDB({ vendorId, creatorUserId }),
			countReferralsByCreatorDB({ vendorId, creatorUserId }),
			countRedeemedRewardsByCreatorDB({ vendorId, creatorUserId }),
			getAvailableRewardsByCreatorDB({ vendorId, creatorUserId }),
		]);

	const campaign = await getActiveCampaign({ vendorId });
	const threshold = campaign?.threshold ?? 10;
	const progressToNext = {
		current: totalReferrals % threshold,
		needed: threshold,
	};

	return {
		totalReferrals,
		rewardsUnlocked,
		rewardsRedeemed,
		availableRewards,
		progressToNext,
		campaignEndDate: campaign?.endDate ?? null,
	};
}

export async function getAvailableRewards({
	vendorId,
	creatorUserId,
}: {
	vendorId: string;
	creatorUserId: string;
}): Promise<IReferralReward[]> {
	return getAvailableRewardsByCreatorDB({ vendorId, creatorUserId });
}

export async function redeemReward({
	rewardId,
	buyerOrderId,
}: {
	rewardId: string;
	buyerOrderId: string;
}): Promise<IReferralReward | null> {
	return redeemReferralRewardDB({ rewardId, buyerOrderId });
}

export async function unlockRewardsForMilestones({
	vendorId,
	creatorUserId,
	campaignId,
	totalReferrals,
	existingRewardCount,
	threshold,
	rewardSnapshot,
}: {
	vendorId: string;
	creatorUserId: string;
	campaignId: string;
	totalReferrals: number;
	existingRewardCount: number;
	threshold: number;
	rewardSnapshot: {
		rewardType: "FREE_MEAL" | "PERCENT_DISCOUNT" | "FIXED_CREDIT";
		rewardExpiryDays: number;
		rewardValue?: number;
	};
}): Promise<IReferralReward[]> {
	const newMilestones = Math.floor(totalReferrals / threshold);
	const targetCount = Math.min(newMilestones, threshold > 0 ? newMilestones : 0);
	const toCreate = targetCount - existingRewardCount;

	if (toCreate <= 0) return [];

	const now = new Date();
	const created: IReferralReward[] = [];

	for (let i = 0; i < toCreate; i++) {
		const rewardNumber = existingRewardCount + i + 1;
		const expiresAt = new Date(
			now.getTime() + (rewardSnapshot.rewardExpiryDays ?? 30) * 24 * 60 * 60 * 1000,
		);

		const reward = await createReferralRewardDB({
			payload: {
				vendorId,
				creatorUserId,
				campaignId,
				rewardNumber,
				unlockedAt: now,
				expiresAt,
				rewardSnapshot: {
					threshold,
					rewardType: rewardSnapshot.rewardType,
					rewardExpiryDays: rewardSnapshot.rewardExpiryDays ?? 30,
					rewardValue: rewardSnapshot.rewardValue,
				},
			},
		});
		if (reward) created.push(reward);
	}

	return created;
}
