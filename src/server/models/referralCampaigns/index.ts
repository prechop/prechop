import mongoose, { type ClientSession, type Model } from "mongoose";
import { databaseResponseTimeHistogram } from "../../metrics";
import { ErrResourceNotFound } from "../../constants";
import { IOperationType } from "../utils";
import type {
	IReferralCampaign,
	IReferralCampaignCreateInput,
} from "./types";

const collectionName = "referralCampaigns";

export type ReferralCampaignModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
		},
		isActive: { type: Boolean, default: false },
		startDate: { type: Date, required: true },
		endDate: { type: Date, required: true },
		threshold: { type: Number, default: 10, min: 1 },
		rewardExpiryDays: { type: Number, default: 30, min: 1 },
		rewardType: {
			type: String,
			enum: ["FREE_MEAL", "PERCENT_DISCOUNT", "FIXED_CREDIT"],
			default: "FREE_MEAL",
		},
		rewardValue: { type: Number },
		maxRewardsPerCreator: { type: Number, default: null },
	},
	{ timestamps: true },
);

schema.index({ vendorId: 1 }, { unique: true });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const ReferralCampaign: ReferralCampaignModel =
	(mongoose.models[collectionName] as ReferralCampaignModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function createReferralCampaignDB({
	payload,
	session,
}: {
	payload: IReferralCampaignCreateInput;
	session?: ClientSession;
}): Promise<IReferralCampaign | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new ReferralCampaign({
			vendorId: new mongoose.Types.ObjectId(payload.vendorId),
			isActive: payload.isActive ?? false,
			startDate: payload.startDate,
			endDate: payload.endDate,
			threshold: payload.threshold ?? 10,
			rewardExpiryDays: payload.rewardExpiryDays ?? 30,
			rewardType: payload.rewardType ?? "FREE_MEAL",
			rewardValue: payload.rewardValue,
			maxRewardsPerCreator: payload.maxRewardsPerCreator ?? null,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createReferralCampaignDB",
			success: "true",
		});
		return doc.toObject() as unknown as IReferralCampaign;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createReferralCampaignDB",
			success: "false",
		});
		return null;
	}
}

export async function getReferralCampaignByVendorDB({
	vendorId,
	session,
}: {
	vendorId: string;
	session?: ClientSession;
}): Promise<IReferralCampaign | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return null;
		const result =
			(
				await ReferralCampaign.aggregate<IReferralCampaign>(
					[
						{
							$match: {
								vendorId: new mongoose.Types.ObjectId(vendorId),
							},
						},
						{ $limit: 1 },
					],
					{ session },
				)
			).at(0) ?? null;
		if (!result) throw ErrResourceNotFound;
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getReferralCampaignByVendorDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getReferralCampaignByVendorDB",
			success: "false",
		});
		return null;
	}
}

export async function updateReferralCampaignDB({
	vendorId,
	payload,
	session,
}: {
	vendorId: string;
	payload: Partial<IReferralCampaignCreateInput>;
	session?: ClientSession;
}): Promise<IReferralCampaign | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return null;
		const res = await ReferralCampaign.findOneAndUpdate(
			{ vendorId: new mongoose.Types.ObjectId(vendorId) },
			{ $set: payload },
			{ session, returnDocument: "after" },
		);
		if (!res) throw ErrResourceNotFound;
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "updateReferralCampaignDB",
			success: "true",
		});
		return res.toObject() as unknown as IReferralCampaign;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "updateReferralCampaignDB",
			success: "false",
		});
		return null;
	}
}

export async function endReferralCampaignDB({
	vendorId,
	session,
}: {
	vendorId: string;
	session?: ClientSession;
}): Promise<IReferralCampaign | null> {
	return updateReferralCampaignDB({
		vendorId,
		payload: { isActive: false },
		session,
	});
}

export * from "./types";
