import mongoose, { type ClientSession, type Model } from "mongoose";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type {
	IReferralAuditLog,
	IReferralAuditLogCreateInput,
} from "./types";

const collectionName = "referralAuditLog";

export type ReferralAuditLogModel = Model<any>;

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
			index: true,
		},
		campaignId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "referralCampaigns",
			required: true,
			index: true,
		},
		outcome: {
			type: String,
			enum: ["accepted", "flagged_ip", "flagged_device", "rejected"],
			required: true,
		},
		reason: { type: String },
		ipHash: { type: String, required: true },
		deviceId: { type: String },
		checkedAt: { type: Date, required: true },
	},
	{ timestamps: true },
);

schema.index({ vendorId: 1, createdAt: -1 });
schema.index({ creatorUserId: 1, outcome: 1 });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const ReferralAuditLog: ReferralAuditLogModel =
	(mongoose.models[collectionName] as ReferralAuditLogModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function createReferralAuditLogDB({
	payload,
	session,
}: {
	payload: IReferralAuditLogCreateInput;
	session?: ClientSession;
}): Promise<IReferralAuditLog | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new ReferralAuditLog({
			vendorId: new mongoose.Types.ObjectId(payload.vendorId),
			creatorUserId: new mongoose.Types.ObjectId(payload.creatorUserId),
			referredUserId: new mongoose.Types.ObjectId(payload.referredUserId),
			buyerOrderId: payload.buyerOrderId
				? new mongoose.Types.ObjectId(payload.buyerOrderId)
				: undefined,
			campaignId: new mongoose.Types.ObjectId(payload.campaignId),
			outcome: payload.outcome,
			reason: payload.reason,
			ipHash: payload.ipHash,
			deviceId: payload.deviceId,
			checkedAt: payload.checkedAt ?? new Date(),
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createReferralAuditLogDB",
			success: "true",
		});
		return doc.toObject() as unknown as IReferralAuditLog;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createReferralAuditLogDB",
			success: "false",
		});
		return null;
	}
}

export async function listReferralAuditLogByVendorDB({
	vendorId,
	limit = 100,
	offset = 0,
	session,
}: {
	vendorId: string;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IReferralAuditLog[]> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return [];
		const result = await ReferralAuditLog.aggregate<IReferralAuditLog>(
			[
				{ $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
				{ $sort: { createdAt: -1 } },
				{ $skip: offset },
				{ $limit: Math.min(limit, 200) },
			],
			{ session },
		);
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listReferralAuditLogByVendorDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listReferralAuditLogByVendorDB",
			success: "false",
		});
		return [];
	}
}

export * from "./types";
