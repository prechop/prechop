import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrResourceNotFound } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type { IAnalyticsSnapshot, IAnalyticsSnapshotPayload } from "./types";

const collectionName = "analyticsSnapshots";

export type AnalyticsSnapshotModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
		},
		date: { type: Date, required: true },
		totalOrders: { type: Number, default: 0 },
		completedOrders: { type: Number, default: 0 },
		cancelledOrders: { type: Number, default: 0 },
		// Integer kobo.
		totalRevenueKobo: { type: Number, default: 0 },
		avgOrderValueKobo: { type: Number, default: 0 },
		topItemIds: { type: [String], default: [] },
		peakHour: { type: Number, required: false },
		newReviewCount: { type: Number, default: 0 },
		avgRatingForDay: { type: Number, required: false },
	},
	{ timestamps: true },
);

// One snapshot per vendor per day.
schema.index({ vendorId: 1, date: 1 }, { unique: true });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const AnalyticsSnapshot: AnalyticsSnapshotModel =
	(mongoose.models[collectionName] as AnalyticsSnapshotModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

// ── Writes ────────────────────────────────────────────────────────────────

export async function upsertAnalyticsSnapshotDB({
	vendorId,
	date,
	payload,
	session,
}: {
	vendorId: string;
	date: Date;
	payload: IAnalyticsSnapshotPayload;
	session?: ClientSession;
}): Promise<IAnalyticsSnapshot | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return null;
		const res = await AnalyticsSnapshot.findOneAndUpdate(
			{ vendorId: new mongoose.Types.ObjectId(vendorId), date },
			{ $set: payload },
			{
				session,
				upsert: true,
				returnDocument: "after",
				setDefaultsOnInsert: true,
			},
		).lean<IAnalyticsSnapshot>();
		if (!res) throw ErrResourceNotFound;
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "upsertAnalyticsSnapshotDB",
			success: "true",
		});
		return { ...res, id: res._id.toString() } as IAnalyticsSnapshot;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "upsertAnalyticsSnapshotDB",
			success: "false",
		});
		return null;
	}
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function listSnapshotsByVendorDB({
	vendorId,
	from,
	to,
	session,
}: {
	vendorId: string;
	from?: Date;
	to?: Date;
	session?: ClientSession;
}): Promise<IAnalyticsSnapshot[]> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return [];
		const match: Record<string, unknown> = {
			vendorId: new mongoose.Types.ObjectId(vendorId),
		};
		if (from || to) {
			const range: Record<string, Date> = {};
			if (from) range.$gte = from;
			if (to) range.$lte = to;
			match.date = range;
		}
		const result = await AnalyticsSnapshot.aggregate<IAnalyticsSnapshot>(
			[{ $match: match }, { $sort: { date: 1 } }],
			{ session },
		);
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listSnapshotsByVendorDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listSnapshotsByVendorDB",
			success: "false",
		});
		return [];
	}
}

export * from "./types";
