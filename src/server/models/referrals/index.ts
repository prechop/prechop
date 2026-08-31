import mongoose, { type ClientSession, type Model } from "mongoose";
import { databaseResponseTimeHistogram } from "../../metrics";
import { ErrResourceNotFound } from "../../constants";
import { IOperationType } from "../utils";
import type { IReferral, IReferralCreateInput } from "./types";

const collectionName = "referrals";

export type ReferralModel = Model<any>;

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
		referredUserId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			required: true,
			index: true,
		},
		buyerOrderId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "buyerOrders",
			required: true,
			index: true,
		},
		campaignId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "referralCampaigns",
			required: true,
			index: true,
		},
		ipHash: { type: String, required: true },
		deviceId: { type: String, index: true },
	},
	{ timestamps: true },
);

schema.index({ vendorId: 1, creatorUserId: 1, creditedAt: -1 });
schema.index({ campaignId: 1, referredUserId: 1 }, { unique: true });
schema.index({ creatorUserId: 1, vendorId: 1, ipHash: 1 });
schema.index({ creatorUserId: 1, vendorId: 1, deviceId: 1 });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const Referral: ReferralModel =
	(mongoose.models[collectionName] as ReferralModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function createReferralDB({
	payload,
	session,
}: {
	payload: IReferralCreateInput;
	session?: ClientSession;
}): Promise<IReferral | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new Referral({
			vendorId: new mongoose.Types.ObjectId(payload.vendorId),
			creatorUserId: new mongoose.Types.ObjectId(payload.creatorUserId),
			referredUserId: new mongoose.Types.ObjectId(payload.referredUserId),
			buyerOrderId: new mongoose.Types.ObjectId(payload.buyerOrderId),
			campaignId: new mongoose.Types.ObjectId(payload.campaignId),
			ipHash: payload.ipHash,
			deviceId: payload.deviceId,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createReferralDB",
			success: "true",
		});
		return doc.toObject() as unknown as IReferral;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createReferralDB",
			success: "false",
		});
		return null;
	}
}

export async function listReferralsByVendorDB({
	vendorId,
	limit = 200,
	offset = 0,
	session,
}: {
	vendorId: string;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IReferral[]> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return [];
		const result = await Referral.aggregate<IReferral>(
			[
				{ $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
				{ $sort: { creditedAt: -1 } },
				{ $skip: offset },
				{ $limit: Math.min(limit, 200) },
			],
			{ session },
		);
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listReferralsByVendorDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listReferralsByVendorDB",
			success: "false",
		});
		return [];
	}
}

export async function getReferralsByCreatorDB({
	vendorId,
	creatorUserId,
	limit = 50,
	offset = 0,
	session,
}: {
	vendorId: string;
	creatorUserId: string;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IReferral[]> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (
			!mongoose.Types.ObjectId.isValid(vendorId) ||
			!mongoose.Types.ObjectId.isValid(creatorUserId)
		) {
			return [];
		}
		const result = await Referral.aggregate<IReferral>(
			[
				{
					$match: {
						vendorId: new mongoose.Types.ObjectId(vendorId),
						creatorUserId: new mongoose.Types.ObjectId(creatorUserId),
					},
				},
				{ $sort: { creditedAt: -1 } },
				{ $skip: offset },
				{ $limit: Math.min(limit, 200) },
			],
			{ session },
		);
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getReferralsByCreatorDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getReferralsByCreatorDB",
			success: "false",
		});
		return [];
	}
}

export async function countReferralsByCreatorDB({
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
		const count = await Referral.countDocuments({
			vendorId: new mongoose.Types.ObjectId(vendorId),
			creatorUserId: new mongoose.Types.ObjectId(creatorUserId),
		});
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "countReferralsByCreatorDB",
			success: "true",
		});
		return count;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "countReferralsByCreatorDB",
			success: "false",
		});
		return 0;
	}
}

export async function hasReferredUserInCampaignDB({
	campaignId,
	referredUserId,
	session,
}: {
	campaignId: string;
	referredUserId: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (
			!mongoose.Types.ObjectId.isValid(campaignId) ||
			!mongoose.Types.ObjectId.isValid(referredUserId)
		) {
			return false;
		}
		const count = await Referral.countDocuments({
			campaignId: new mongoose.Types.ObjectId(campaignId),
			referredUserId: new mongoose.Types.ObjectId(referredUserId),
		});
		return count > 0;
	} catch {
		return false;
	}
}

export async function findIpCollisionDB({
	vendorId,
	creatorUserId,
	campaignId,
	ipHash,
	excludeBuyerOrderId,
	session,
}: {
	vendorId: string;
	creatorUserId: string;
	campaignId: string;
	ipHash: string;
	excludeBuyerOrderId: string;
	session?: ClientSession;
}): Promise<IReferral | null> {
	try {
		if (
			!mongoose.Types.ObjectId.isValid(vendorId) ||
			!mongoose.Types.ObjectId.isValid(creatorUserId) ||
			!mongoose.Types.ObjectId.isValid(campaignId) ||
			!mongoose.Types.ObjectId.isValid(excludeBuyerOrderId)
		) {
			return null;
		}
		return (
			(
				await Referral.aggregate<IReferral>(
					[
						{
							$match: {
								vendorId: new mongoose.Types.ObjectId(vendorId),
								creatorUserId: new mongoose.Types.ObjectId(creatorUserId),
								campaignId: new mongoose.Types.ObjectId(campaignId),
								ipHash,
								buyerOrderId: {
									$ne: new mongoose.Types.ObjectId(excludeBuyerOrderId),
								},
							},
						},
						{ $limit: 1 },
					],
					{ session },
				)
			).at(0) ?? null
		);
	} catch {
		return null;
	}
}

export async function findDeviceCollisionDB({
	vendorId,
	creatorUserId,
	campaignId,
	deviceId,
	excludeBuyerOrderId,
	session,
}: {
	vendorId: string;
	creatorUserId: string;
	campaignId: string;
	deviceId: string;
	excludeBuyerOrderId: string;
	session?: ClientSession;
}): Promise<IReferral | null> {
	try {
		if (
			!mongoose.Types.ObjectId.isValid(vendorId) ||
			!mongoose.Types.ObjectId.isValid(creatorUserId) ||
			!mongoose.Types.ObjectId.isValid(campaignId) ||
			!mongoose.Types.ObjectId.isValid(excludeBuyerOrderId)
		) {
			return null;
		}
		return (
			(
				await Referral.aggregate<IReferral>(
					[
						{
							$match: {
								vendorId: new mongoose.Types.ObjectId(vendorId),
								creatorUserId: new mongoose.Types.ObjectId(creatorUserId),
								campaignId: new mongoose.Types.ObjectId(campaignId),
								deviceId,
								buyerOrderId: {
									$ne: new mongoose.Types.ObjectId(excludeBuyerOrderId),
								},
							},
						},
						{ $limit: 1 },
					],
					{ session },
				)
			).at(0) ?? null
		);
	} catch {
		return null;
	}
}

export * from "./types";
