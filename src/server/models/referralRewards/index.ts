import mongoose, { type ClientSession, type Model } from "mongoose";
import { databaseResponseTimeHistogram } from "../../metrics";
import { ErrResourceNotFound } from "../../constants";
import { IOperationType } from "../utils";
import type {
	IReferralReward,
	IReferralRewardCreateInput,
} from "./types";

const collectionName = "referralRewards";

export type ReferralRewardModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
		},
		creatorUserId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			required: true,
			index: true,
		},
		campaignId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "referralCampaigns",
			required: true,
			index: true,
		},
		rewardNumber: { type: Number, required: true },
		unlockedAt: { type: Date, required: true },
		expiresAt: { type: Date, required: true, index: true },
		redeemedAt: { type: Date },
		redeemedBuyerOrderId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "buyerOrders",
		},
		rewardSnapshot: {
			threshold: { type: Number, required: true },
			rewardType: {
				type: String,
				enum: ["FREE_MEAL", "PERCENT_DISCOUNT", "FIXED_CREDIT"],
				required: true,
			},
			rewardExpiryDays: { type: Number, required: true },
			rewardValue: { type: Number },
		},
	},
	{ timestamps: true },
);

schema.index(
	{ vendorId: 1, creatorUserId: 1, rewardNumber: 1 },
	{ unique: true },
);
schema.index({ creatorUserId: 1, expiresAt: 1 });
schema.index({ redeemedBuyerOrderId: 1 });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const ReferralReward: ReferralRewardModel =
	(mongoose.models[collectionName] as ReferralRewardModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function createReferralRewardDB({
	payload,
	session,
}: {
	payload: IReferralRewardCreateInput;
	session?: ClientSession;
}): Promise<IReferralReward | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new ReferralReward({
			vendorId: new mongoose.Types.ObjectId(payload.vendorId),
			creatorUserId: new mongoose.Types.ObjectId(payload.creatorUserId),
			campaignId: new mongoose.Types.ObjectId(payload.campaignId),
			rewardNumber: payload.rewardNumber,
			unlockedAt: payload.unlockedAt,
			expiresAt: payload.expiresAt,
			rewardSnapshot: payload.rewardSnapshot,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createReferralRewardDB",
			success: "true",
		});
		return doc.toObject() as unknown as IReferralReward;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createReferralRewardDB",
			success: "false",
		});
		return null;
	}
}

export async function getAvailableRewardsByCreatorDB({
	vendorId,
	creatorUserId,
	session,
}: {
	vendorId: string;
	creatorUserId: string;
	session?: ClientSession;
}): Promise<IReferralReward[]> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (
			!mongoose.Types.ObjectId.isValid(vendorId) ||
			!mongoose.Types.ObjectId.isValid(creatorUserId)
		) {
			return [];
		}
		const now = new Date();
		const result = await ReferralReward.aggregate<IReferralReward>(
			[
				{
					$match: {
						vendorId: new mongoose.Types.ObjectId(vendorId),
						creatorUserId: new mongoose.Types.ObjectId(creatorUserId),
						redeemedAt: null,
						expiresAt: { $gt: now },
					},
				},
				{ $sort: { rewardNumber: 1 } },
			],
			{ session },
		);
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getAvailableRewardsByCreatorDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getAvailableRewardsByCreatorDB",
			success: "false",
		});
		return [];
	}
}

export async function redeemReferralRewardDB({
	rewardId,
	buyerOrderId,
	session,
}: {
	rewardId: string;
	buyerOrderId: string;
	session?: ClientSession;
}): Promise<IReferralReward | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (
			!mongoose.Types.ObjectId.isValid(rewardId) ||
			!mongoose.Types.ObjectId.isValid(buyerOrderId)
		) {
			return null;
		}
		const res = await ReferralReward.findOneAndUpdate(
			{
				_id: new mongoose.Types.ObjectId(rewardId),
				redeemedAt: null,
				expiresAt: { $gt: new Date() },
			},
			{
				$set: {
					redeemedAt: new Date(),
					redeemedBuyerOrderId: new mongoose.Types.ObjectId(buyerOrderId),
				},
			},
			{ session, returnDocument: "after" },
		);
		if (!res) throw ErrResourceNotFound;
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "redeemReferralRewardDB",
			success: "true",
		});
		return res.toObject() as unknown as IReferralReward;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "redeemReferralRewardDB",
			success: "false",
		});
		return null;
	}
}

export async function countRedeemedRewardsByCreatorDB({
	vendorId,
	creatorUserId,
	session,
}: {
	vendorId: string;
	creatorUserId: string;
	session?: ClientSession;
}): Promise<number> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (
			!mongoose.Types.ObjectId.isValid(vendorId) ||
			!mongoose.Types.ObjectId.isValid(creatorUserId)
		) {
			return 0;
		}
		const count = await ReferralReward.countDocuments({
			vendorId: new mongoose.Types.ObjectId(vendorId),
			creatorUserId: new mongoose.Types.ObjectId(creatorUserId),
			redeemedAt: { $ne: null },
		});
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "countRedeemedRewardsByCreatorDB",
			success: "true",
		});
		return count;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "countRedeemedRewardsByCreatorDB",
			success: "false",
		});
		return 0;
	}
}

export * from "./types";
