import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrResourceNotFound, MAX_LIMIT } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type { IReview, IReviewCreateInput } from "./types";

const collectionName = "reviews";

export type ReviewModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		buyerOrderId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "buyerOrders",
			required: true,
			unique: true,
		},
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
		},
		buyerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			required: true,
			index: true,
		},
		rating: { type: Number, min: 1, max: 5, required: true },
		comment: { type: String, required: false },
		tags: { type: [String], default: [] },
		isFlagged: { type: Boolean, default: false },
	},
	{ timestamps: true },
);

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const Review: ReviewModel =
	(mongoose.models[collectionName] as ReviewModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

// ── Writes ────────────────────────────────────────────────────────────────

export async function createReviewDB({
	payload,
	session,
}: {
	payload: IReviewCreateInput;
	session?: ClientSession;
}): Promise<IReview | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new Review({
			buyerOrderId: payload.buyerOrderId,
			vendorId: payload.vendorId,
			buyerId: payload.buyerId,
			rating: payload.rating,
			comment: payload.comment,
			tags: payload.tags ?? [],
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createReviewDB",
			success: "true",
		});
		return doc.toObject() as unknown as IReview;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createReviewDB",
			success: "false",
		});
		return null;
	}
}

export async function flagReviewDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const res = await Review.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { isFlagged: true } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getReviewByOrderDB({
	buyerOrderId,
	session,
}: {
	buyerOrderId: string;
	session?: ClientSession;
}): Promise<IReview | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(buyerOrderId)) return null;
		const result =
			(
				await Review.aggregate<IReview>(
					[
						{
							$match: {
								buyerOrderId: new mongoose.Types.ObjectId(
									buyerOrderId,
								),
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
			method: "getReviewByOrderDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getReviewByOrderDB",
			success: "false",
		});
		return null;
	}
}

export async function getReviewByIdDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IReview | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		return (
			(
				await Review.aggregate<IReview>(
					[
						{ $match: { _id: new mongoose.Types.ObjectId(id) } },
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

export async function listReviewsByVendorDB({
	vendorId,
	limit = MAX_LIMIT,
	offset = 0,
	session,
}: {
	vendorId: string;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IReview[]> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return [];
		const result = await Review.aggregate<IReview>(
			[
				{ $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
				{ $sort: { createdAt: -1 } },
				{ $skip: offset },
				{ $limit: Math.min(limit, MAX_LIMIT) },
			],
			{ session },
		);
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listReviewsByVendorDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listReviewsByVendorDB",
			success: "false",
		});
		return [];
	}
}

/** Reviews a user WROTE (as a buyer), newest first. */
export async function listReviewsByBuyerDB({
	buyerId,
	limit = MAX_LIMIT,
	offset = 0,
	session,
}: {
	buyerId: string;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IReview[]> {
	try {
		if (!mongoose.Types.ObjectId.isValid(buyerId)) return [];
		return await Review.aggregate<IReview>(
			[
				{ $match: { buyerId: new mongoose.Types.ObjectId(buyerId) } },
				{ $sort: { createdAt: -1 } },
				{ $skip: offset },
				{ $limit: Math.min(limit, MAX_LIMIT) },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

export async function getVendorRatingAggregateDB({
	vendorId,
	session,
}: {
	vendorId: string;
	session?: ClientSession;
}): Promise<{ avg: number; count: number }> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) {
			return { avg: 0, count: 0 };
		}
		const row = (
			await Review.aggregate<{ avg: number; count: number }>(
				[
					{
						$match: {
							vendorId: new mongoose.Types.ObjectId(vendorId),
						},
					},
					{
						$group: {
							_id: "$vendorId",
							avg: { $avg: "$rating" },
							count: { $sum: 1 },
						},
					},
				],
				{ session },
			)
		).at(0);
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getVendorRatingAggregateDB",
			success: "true",
		});
		return { avg: row?.avg ?? 0, count: row?.count ?? 0 };
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getVendorRatingAggregateDB",
			success: "false",
		});
		return { avg: 0, count: 0 };
	}
}

export async function listFlaggedReviewsDB({
	limit = MAX_LIMIT,
	offset = 0,
	session,
}: {
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IReview[]> {
	try {
		return await Review.aggregate<IReview>(
			[
				{ $match: { isFlagged: true } },
				{ $sort: { createdAt: -1 } },
				{ $skip: offset },
				{ $limit: Math.min(limit, MAX_LIMIT) },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

export async function unflagReviewDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const res = await Review.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { isFlagged: false } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function deleteReviewDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IReview | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const res = await Review.findByIdAndDelete(
			new mongoose.Types.ObjectId(id),
			{ session },
		);
		return res ? (res.toObject() as unknown as IReview) : null;
	} catch {
		return null;
	}
}

export * from "./types";
export { MAX_LIMIT };
