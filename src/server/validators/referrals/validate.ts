import { z as zod } from "zod";

export const createReferralCampaignSchema = zod
	.object({
		isActive: zod.boolean().optional(),
		threshold: zod.number().int().min(1).optional(),
		rewardExpiryDays: zod.number().int().min(1).optional(),
		rewardType: zod
			.enum(["FREE_MEAL", "PERCENT_DISCOUNT", "FIXED_CREDIT"])
			.optional(),
		rewardValue: zod.number().optional(),
		maxRewardsPerCreator: zod.number().int().min(1).nullable().optional(),
		endDate: zod.string().datetime().optional(),
	})
	.strict();

export const endReferralCampaignSchema = zod.object({}).strict();

export const applyRewardSchema = zod
	.object({
		rewardId: zod.string().trim().min(1),
	})
	.strict();
