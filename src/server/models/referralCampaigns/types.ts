export interface IReferralCampaignCreateInput {
	vendorId: string;
	isActive?: boolean;
	startDate: Date;
	endDate: Date;
	threshold?: number;
	rewardExpiryDays?: number;
	rewardType?: "FREE_MEAL" | "PERCENT_DISCOUNT" | "FIXED_CREDIT";
	rewardValue?: number;
	maxRewardsPerCreator?: number | null;
}

export interface IReferralCampaign {
	_id: string;
	id?: string;
	vendorId: string;
	isActive: boolean;
	startDate: Date;
	endDate: Date;
	threshold: number;
	rewardExpiryDays: number;
	rewardType: "FREE_MEAL" | "PERCENT_DISCOUNT" | "FIXED_CREDIT";
	rewardValue?: number;
	maxRewardsPerCreator?: number | null;
	createdAt: Date;
	updatedAt: Date;
}
