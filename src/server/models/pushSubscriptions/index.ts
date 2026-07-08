import mongoose, { type ClientSession, type Model } from "mongoose";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type { IPushSubscription, IPushSubscriptionKeys } from "./types";

const collectionName = "pushSubscriptions";

export type PushSubscriptionModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			required: true,
			index: true,
		},
		endpoint: { type: String, required: true, unique: true },
		keys: {
			p256dh: { type: String, required: true },
			auth: { type: String, required: true },
		},
		userAgent: { type: String, required: false },
	},
	{ timestamps: true },
);

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const PushSubscription: PushSubscriptionModel =
	(mongoose.models[collectionName] as PushSubscriptionModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

// ── Writes ────────────────────────────────────────────────────────────────

export async function upsertPushSubscriptionDB({
	userId,
	endpoint,
	keys,
	userAgent,
	session,
}: {
	userId: string;
	endpoint: string;
	keys: IPushSubscriptionKeys;
	userAgent?: string;
	session?: ClientSession;
}): Promise<IPushSubscription | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const res = await PushSubscription.findOneAndUpdate(
			{ endpoint },
			{
				$set: {
					userId: new mongoose.Types.ObjectId(userId),
					endpoint,
					keys,
					userAgent,
				},
			},
			{ session, upsert: true, returnDocument: "after" },
		).lean<IPushSubscription>();
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "upsertPushSubscriptionDB",
			success: "true",
		});
		return res
			? ({ ...res, id: res._id.toString() } as IPushSubscription)
			: null;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "upsertPushSubscriptionDB",
			success: "false",
		});
		return null;
	}
}

export async function deletePushSubscriptionByEndpointDB({
	endpoint,
	session,
}: {
	endpoint: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await PushSubscription.findOneAndDelete(
			{ endpoint },
			{ session },
		);
		return !!res;
	} catch {
		return false;
	}
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function listPushSubscriptionsByUserDB({
	userId,
	session,
}: {
	userId: string;
	session?: ClientSession;
}): Promise<IPushSubscription[]> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const result = await PushSubscription.aggregate<IPushSubscription>(
			[
				{ $match: { userId: new mongoose.Types.ObjectId(userId) } },
				{ $sort: { createdAt: -1 } },
			],
			{ session },
		);
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listPushSubscriptionsByUserDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listPushSubscriptionsByUserDB",
			success: "false",
		});
		return [];
	}
}

export * from "./types";
