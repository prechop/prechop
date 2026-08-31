export interface IReferralRewardSnapshot {
	threshold: number;
	rewardType: "FREE_MEAL" | "PERCENT_DISCOUNT" | "FIXED_CREDIT";
	rewardExpiryDays: number;
	rewardValue?: number;
}

export interface IReferralReward {
	_id: string;
	id?: string;
	vendorId: string;
	creatorUserId: string;
	campaignId: string;
	rewardNumber: number;
	unlockedAt: Date;
	expiresAt: Date;
	redeemedAt?: Date;
	redeemedBuyerOrderId?: string;
	rewardSnapshot: IReferralRewardSnapshot;
	createdAt: Date;
	updatedAt: Date;
}

export interface IReferralRewardCreateInput {
	vendorId: string;
	creatorUserId: string;
	campaignId: string;
	rewardNumber: number;
	unlockedAt: Date;
	expiresAt: Date;
	rewardSnapshot: IReferralRewardSnapshot;
}
