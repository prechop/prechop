import mongoose, { type ClientSession, type Model } from "mongoose";
import { databaseResponseTimeHistogram } from "../../metrics";
import { ErrResourceNotFound } from "../../constants";
import { IOperationType } from "../utils";
import type { IReferralLink, IReferralLinkCreateInput } from "./types";

const collectionName = "referralLinks";

export type ReferralLinkModel = Model<any>;

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
		token: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
	},
	{ timestamps: true },
);

schema.index({ vendorId: 1, creatorUserId: 1 }, { unique: true });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const ReferralLink: ReferralLinkModel =
	(mongoose.models[collectionName] as ReferralLinkModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function createReferralLinkDB({
	payload,
	session,
}: {
	payload: IReferralLinkCreateInput;
	session?: ClientSession;
}): Promise<IReferralLink | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new ReferralLink({
			vendorId: new mongoose.Types.ObjectId(payload.vendorId),
			creatorUserId: new mongoose.Types.ObjectId(payload.creatorUserId),
			token: payload.token,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createReferralLinkDB",
			success: "true",
		});
		return doc.toObject() as unknown as IReferralLink;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createReferralLinkDB",
			success: "false",
		});
		return null;
	}
}

export async function getReferralLinkByTokenDB({
	token,
	session,
}: {
	token: string;
	session?: ClientSession;
}): Promise<IReferralLink | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const result =
			(
				await ReferralLink.aggregate<IReferralLink>(
					[
						{ $match: { token } },
						{ $limit: 1 },
					],
					{ session },
				)
			).at(0) ?? null;
		if (!result) throw ErrResourceNotFound;
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getReferralLinkByTokenDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getReferralLinkByTokenDB",
			success: "false",
		});
		return null;
	}
}

export async function getReferralLinkByCreatorDB({
	vendorId,
	creatorUserId,
	session,
}: {
	vendorId: string;
	creatorUserId: string;
	session?: ClientSession;
}): Promise<IReferralLink | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (
			!mongoose.Types.ObjectId.isValid(vendorId) ||
			!mongoose.Types.ObjectId.isValid(creatorUserId)
		) {
			return null;
		}
		const result =
			(
				await ReferralLink.aggregate<IReferralLink>(
					[
						{
							$match: {
								vendorId: new mongoose.Types.ObjectId(vendorId),
								creatorUserId: new mongoose.Types.ObjectId(creatorUserId),
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
			method: "getReferralLinkByCreatorDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getReferralLinkByCreatorDB",
			success: "false",
		});
		return null;
	}
}

export * from "./types";
