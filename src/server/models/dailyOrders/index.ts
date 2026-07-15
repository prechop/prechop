import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrDailyOrderNotFound, MAX_LIMIT } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { DailyOrderStatus, VendorStatus } from "../enums";
import { IOperationType } from "../utils";
import type {
	IDailyOrder,
	IDailyOrderCreateInput,
	IDailyOrderItemInput,
} from "./types";

const collectionName = "dailyOrders";

export type DailyOrderModel = Model<any>;

const optionSchema = new mongoose.Schema(
	{
		name: { type: String, required: true },
		priceKobo: { type: Number, required: true, min: 0 },
		displayOrder: { type: Number, default: 0 },
	},
	{ _id: true },
);

const optionGroupSchema = new mongoose.Schema(
	{
		sourceGroupId: { type: mongoose.Schema.Types.ObjectId, default: null },
		name: { type: String, required: true },
		required: { type: Boolean, default: false },
		minSelect: { type: Number, default: 0, min: 0 },
		maxSelect: { type: Number, default: null },
		options: { type: [optionSchema], default: [] },
	},
	{ _id: true },
);

const itemSchema = new mongoose.Schema(
	{
		menuItemId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "menuItems",
			required: true,
		},
		snapshotName: { type: String, required: true },
		snapshotPriceKobo: { type: Number, required: true, min: 0 },
		snapshotImageUrl: { type: String },
		snapshotPrepMin: { type: Number, default: 20 },
		maxQuantity: { type: Number, default: null },
		orderedQuantity: { type: Number, default: 0 },
		optionGroups: { type: [optionGroupSchema], default: [] },
	},
	{ _id: true },
);

const schema = new mongoose.Schema<any>(
	{
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
		},
		campusId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "campuses",
			required: true,
			index: true,
		},
		shareableToken: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		title: { type: String, required: true },
		scheduledDate: { type: Date, required: true },
		// Ordering opens here; before it the listing is "coming soon".
		availableFrom: { type: Date },
		cutoffTime: { type: Date, required: true },
		status: {
			type: String,
			enum: Object.values(DailyOrderStatus),
			default: DailyOrderStatus.DRAFT,
		},
		isPublic: { type: Boolean, default: true },
		pickupAvailable: { type: Boolean, default: true },
		deliveryAvailable: { type: Boolean, default: false },
		deliveryFeeKobo: { type: Number, default: 0 },
		totalOrdersCount: { type: Number, default: 0 },
		items: { type: [itemSchema], default: [] },
		deleted: { type: Boolean, default: false, select: false },
	},
	{ timestamps: true },
);

schema.index({ campusId: 1, status: 1 });
schema.index({ campusId: 1, scheduledDate: 1 });

const withEmbeddedIds = {
	id: { $toString: "$_id" },
	items: {
		$map: {
			input: { $ifNull: ["$items", []] },
			as: "it",
			in: {
				$mergeObjects: [
					"$$it",
					{
						id: { $toString: "$$it._id" },
						optionGroups: {
							$map: {
								input: { $ifNull: ["$$it.optionGroups", []] },
								as: "g",
								in: {
									$mergeObjects: [
										"$$g",
										{
											id: { $toString: "$$g._id" },
											options: {
												$map: {
													input: {
														$ifNull: [
															"$$g.options",
															[],
														],
													},
													as: "op",
													in: {
														$mergeObjects: [
															"$$op",
															{
																id: {
																	$toString:
																		"$$op._id",
																},
															},
														],
													},
												},
											},
										},
									],
								},
							},
						},
					},
				],
			},
		},
	},
};

schema.pre("aggregate", function () {
	this.pipeline().unshift({ $match: { deleted: false } });
	this.pipeline().push({ $addFields: withEmbeddedIds });
	this.pipeline().push({ $project: { deleted: 0, __v: 0 } });
});

export const DailyOrder: DailyOrderModel =
	(mongoose.models[collectionName] as DailyOrderModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

function mapItems(items: IDailyOrderItemInput[]) {
	return items.map((it) => ({
		menuItemId: new mongoose.Types.ObjectId(it.menuItemId),
		snapshotName: it.snapshotName,
		snapshotPriceKobo: it.snapshotPriceKobo,
		snapshotImageUrl: it.snapshotImageUrl,
		snapshotPrepMin: it.snapshotPrepMin,
		maxQuantity: it.maxQuantity ?? null,
		orderedQuantity: 0,
		optionGroups: (it.optionGroups ?? []).map((g) => ({
			sourceGroupId:
				g.sourceGroupId &&
				mongoose.Types.ObjectId.isValid(g.sourceGroupId)
					? new mongoose.Types.ObjectId(g.sourceGroupId)
					: null,
			name: g.name,
			required: g.required ?? false,
			minSelect: g.minSelect ?? 0,
			maxSelect: g.maxSelect ?? null,
			options: (g.options ?? []).map((o, i) => ({
				name: o.name,
				priceKobo: o.priceKobo,
				displayOrder: o.displayOrder ?? i,
			})),
		})),
	}));
}

export async function createDailyOrderDB({
	payload,
	session,
}: {
	payload: IDailyOrderCreateInput;
	session?: ClientSession;
}): Promise<IDailyOrder | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new DailyOrder({
			vendorId: payload.vendorId,
			campusId: payload.campusId,
			shareableToken: payload.shareableToken,
			title: payload.title,
			scheduledDate: payload.scheduledDate,
			availableFrom: payload.availableFrom,
			cutoffTime: payload.cutoffTime,
			isPublic: payload.isPublic ?? true,
			pickupAvailable: payload.pickupAvailable ?? true,
			deliveryAvailable: payload.deliveryAvailable ?? false,
			deliveryFeeKobo: payload.deliveryFeeKobo ?? 0,
			items: mapItems(payload.items),
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createDailyOrderDB",
			success: "true",
		});
		return doc.toObject() as unknown as IDailyOrder;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createDailyOrderDB",
			success: "false",
		});
		return null;
	}
}

export async function getDailyOrderByIdDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IDailyOrder | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		return (
			(
				await DailyOrder.aggregate<IDailyOrder>(
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

export async function getDailyOrderByTokenDB({
	shareableToken,
	session,
}: {
	shareableToken: string;
	session?: ClientSession;
}): Promise<IDailyOrder | null> {
	try {
		return (
			(
				await DailyOrder.aggregate<IDailyOrder>(
					[{ $match: { shareableToken } }, { $limit: 1 }],
					{ session },
				)
			).at(0) ?? null
		);
	} catch {
		return null;
	}
}

/** Escape user input so it's matched as a literal inside a $regex. */
function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listDailyOrdersByVendorDB({
	vendorId,
	status,
	q,
	from,
	to,
	limit = MAX_LIMIT,
	offset = 0,
	session,
}: {
	vendorId: string;
	status?: DailyOrderStatus;
	/** Case-insensitive title search (matched literally, not as a pattern). */
	q?: string;
	/** Inclusive scheduledDate lower/upper bounds. */
	from?: Date;
	to?: Date;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IDailyOrder[]> {
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return [];
		const match: Record<string, unknown> = {
			vendorId: new mongoose.Types.ObjectId(vendorId),
		};
		if (status) match.status = status;
		const term = q?.trim();
		if (term) {
			// Escape so a title containing regex metacharacters (e.g. "Buy 1 (get 1)")
			// is searched literally rather than as a pattern.
			match.title = { $regex: escapeRegExp(term), $options: "i" };
		}
		if (from || to) {
			const range: Record<string, Date> = {};
			if (from) range.$gte = from;
			if (to) range.$lte = to;
			match.scheduledDate = range;
		}
		return await DailyOrder.aggregate<IDailyOrder>(
			[
				{ $match: match },
				{ $sort: { scheduledDate: -1 } },
				{ $skip: offset },
				{ $limit: Math.min(limit, MAX_LIMIT) },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

export async function listActiveDailyOrdersByCampusDB({
	campusId,
	campusIds,
	limit = MAX_LIMIT,
	offset = 0,
	excludeVendorId,
	session,
}: {
	/** Single campus. Ignored when `campusIds` is provided. */
	campusId?: string;
	/** Multiple campuses (e.g. every campus in the buyer's state). */
	campusIds?: string[];
	limit?: number;
	offset?: number;
	/** Drop listings owned by this vendor profile (a vendor never sees their own). */
	excludeVendorId?: string;
	session?: ClientSession;
}): Promise<IDailyOrder[]> {
	try {
		const ids = (campusIds?.length ? campusIds : campusId ? [campusId] : [])
			.filter((c) => mongoose.Types.ObjectId.isValid(c))
			.map((c) => new mongoose.Types.ObjectId(c));
		if (ids.length === 0) return [];
		const match: Record<string, unknown> = {
			status: DailyOrderStatus.ACTIVE,
			isPublic: true,
			cutoffTime: { $gt: new Date() },
		};
		if (
			excludeVendorId &&
			mongoose.Types.ObjectId.isValid(excludeVendorId)
		) {
			match.vendorId = {
				$ne: new mongoose.Types.ObjectId(excludeVendorId),
			};
		}
		return await DailyOrder.aggregate<IDailyOrder>(
			[
				{ $match: match },
				// Only surface listings from vendors currently open for orders —
				// a closed kitchen is hidden from the marketplace until it reopens.
				{
					$lookup: {
						// Mongoose derives the collection name by lowercasing the
						// model name ("vendorProfiles" → "vendorprofiles").
						from: "vendorprofiles",
						localField: "vendorId",
						foreignField: "_id",
						as: "_vendor",
					},
				},
				{
					$match: {
						"_vendor.isOpenForOrders": true,
						"_vendor.status": VendorStatus.ACTIVE,
						$or: [
							{ campusId: { $in: ids } },
							{ "_vendor.campusIds": { $in: ids } },
						],
					},
				},
				// Surface the shop name on each card without a second round-trip.
				{
					$addFields: {
						vendorName: {
							$arrayElemAt: ["$_vendor.businessName", 0],
						},
					},
				},
				{ $unset: "_vendor" },
				{ $sort: { cutoffTime: 1 } },
				{ $skip: offset },
				{ $limit: Math.min(limit, MAX_LIMIT) },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

/**
 * Distinct vendorIds within `campusIds` running an active, public, still-open
 * listing whose title or any item name matches `q` (case-insensitive, literal).
 * Powers the marketplace search's "by listing" dimension.
 */
export async function findVendorIdsByListingSearchDB({
	campusIds,
	q,
}: {
	campusIds: string[];
	q: string;
}): Promise<string[]> {
	try {
		const ids = campusIds
			.filter((c) => mongoose.Types.ObjectId.isValid(c))
			.map((c) => new mongoose.Types.ObjectId(c));
		const term = q.trim();
		if (ids.length === 0 || !term) return [];
		const rx = { $regex: escapeRegExp(term), $options: "i" };
		const rows = await DailyOrder.aggregate<{
			_id: mongoose.Types.ObjectId;
		}>([
			{
				$match: {
					status: DailyOrderStatus.ACTIVE,
					isPublic: true,
					cutoffTime: { $gt: new Date() },
					$or: [{ title: rx }, { "items.snapshotName": rx }],
				},
			},
			{
				$lookup: {
					from: "vendorprofiles",
					localField: "vendorId",
					foreignField: "_id",
					as: "_vendor",
				},
			},
			{
				$match: {
					"_vendor.status": VendorStatus.ACTIVE,
					$or: [
						{ campusId: { $in: ids } },
						{ "_vendor.campusIds": { $in: ids } },
					],
				},
			},
			{ $group: { _id: "$vendorId" } },
		]);
		return rows.map((r) => r._id.toString());
	} catch {
		return [];
	}
}

export async function updateDailyOrderDraftDB({
	id,
	vendorId,
	payload,
	now,
	session,
}: {
	id: string;
	vendorId: string;
	payload: Partial<IDailyOrderCreateInput>;
	/** Edits are only accepted while `availableFrom` is still in the future. */
	now: Date;
	session?: ClientSession;
}): Promise<IDailyOrder | null> {
	try {
		const set: Record<string, unknown> = {};
		if (payload.title !== undefined) set.title = payload.title;
		if (payload.scheduledDate !== undefined)
			set.scheduledDate = payload.scheduledDate;
		if (payload.availableFrom !== undefined)
			set.availableFrom = payload.availableFrom;
		if (payload.cutoffTime !== undefined)
			set.cutoffTime = payload.cutoffTime;
		if (payload.isPublic !== undefined) set.isPublic = payload.isPublic;
		if (payload.pickupAvailable !== undefined)
			set.pickupAvailable = payload.pickupAvailable;
		if (payload.deliveryAvailable !== undefined)
			set.deliveryAvailable = payload.deliveryAvailable;
		if (payload.deliveryFeeKobo !== undefined)
			set.deliveryFeeKobo = payload.deliveryFeeKobo;
		if (payload.items !== undefined) set.items = mapItems(payload.items);

		// A listing is editable only until it opens for orders: it must not be
		// closed/cancelled and its `availableFrom` must still be in the future.
		// Guarding on `availableFrom > now` at the write makes the lock atomic —
		// a listing whose open time elapses between the service check and here
		// simply matches nothing rather than being edited out from under buyers.
		const res = await DailyOrder.findOneAndUpdate(
			{
				_id: new mongoose.Types.ObjectId(id),
				vendorId: new mongoose.Types.ObjectId(vendorId),
				status: {
					$in: [DailyOrderStatus.DRAFT, DailyOrderStatus.ACTIVE],
				},
				availableFrom: { $gt: now },
			},
			{ $set: set },
			{ session, returnDocument: "after" },
		);
		if (!res) throw ErrDailyOrderNotFound;
		return res.toObject() as unknown as IDailyOrder;
	} catch {
		return null;
	}
}

export async function setDailyOrderStatusDB({
	id,
	vendorId,
	status,
	fromStatuses,
	session,
}: {
	id: string;
	vendorId?: string;
	status: DailyOrderStatus;
	fromStatuses?: DailyOrderStatus[];
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const filter: Record<string, unknown> = {
			_id: new mongoose.Types.ObjectId(id),
		};
		if (vendorId) filter.vendorId = new mongoose.Types.ObjectId(vendorId);
		if (fromStatuses?.length) filter.status = { $in: fromStatuses };
		const res = await DailyOrder.findOneAndUpdate(
			filter,
			{ $set: { status } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function closeActiveDailyOrdersByVendorDB({
	vendorId,
	session,
}: {
	vendorId: string;
	session?: ClientSession;
}): Promise<number> {
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return 0;
		const res = await DailyOrder.updateMany(
			{
				vendorId: new mongoose.Types.ObjectId(vendorId),
				status: DailyOrderStatus.ACTIVE,
			},
			{ $set: { status: DailyOrderStatus.CLOSED } },
			{ session },
		);
		return res.modifiedCount;
	} catch {
		return 0;
	}
}

export async function incrementDailyOrderItemQuantityDB({
	dailyOrderId,
	dailyOrderItemId,
	by,
	session,
}: {
	dailyOrderId: string;
	dailyOrderItemId: string;
	by: number;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await DailyOrder.updateOne(
			{
				_id: new mongoose.Types.ObjectId(dailyOrderId),
				"items._id": new mongoose.Types.ObjectId(dailyOrderItemId),
			},
			{ $inc: { "items.$.orderedQuantity": by } },
			{ session },
		);
		return res.modifiedCount > 0;
	} catch {
		return false;
	}
}

/**
 * Return capacity to a listing item when a settled (PAID/CONFIRMED) order is
 * cancelled. Clamps at 0 via an aggregation-pipeline update so a stray double
 * call can never drive `orderedQuantity` negative (which would silently inflate
 * available capacity and permit oversell).
 */
export async function decrementDailyOrderItemQuantityDB({
	dailyOrderId,
	dailyOrderItemId,
	by,
	session,
}: {
	dailyOrderId: string;
	dailyOrderItemId: string;
	by: number;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const dailyOrderObjectId = new mongoose.Types.ObjectId(dailyOrderId);
		const itemObjectId = new mongoose.Types.ObjectId(dailyOrderItemId);
		// Normal path: the item has at least `by` units committed, so decrement.
		const dec = await DailyOrder.updateOne(
			{
				_id: dailyOrderObjectId,
				items: {
					$elemMatch: {
						_id: itemObjectId,
						orderedQuantity: { $gte: by },
					},
				},
			},
			{ $inc: { "items.$.orderedQuantity": -by } },
			{ session },
		);
		if (dec.modifiedCount > 0) return true;
		// Underflow guard (double call / drift): floor at 0 rather than negative,
		// since a negative orderedQuantity would inflate availability and oversell.
		const floor = await DailyOrder.updateOne(
			{ _id: dailyOrderObjectId, "items._id": itemObjectId },
			{ $set: { "items.$.orderedQuantity": 0 } },
			{ session },
		);
		return floor.modifiedCount > 0;
	} catch {
		return false;
	}
}

export async function incrementDailyOrderTotalCountDB({
	dailyOrderId,
	by = 1,
	session,
}: {
	dailyOrderId: string;
	by?: number;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await DailyOrder.updateOne(
			{ _id: new mongoose.Types.ObjectId(dailyOrderId) },
			{ $inc: { totalOrdersCount: by } },
			{ session },
		);
		return res.modifiedCount > 0;
	} catch {
		return false;
	}
}

/** Cron sweep: close ACTIVE listings whose cutoff has passed. */
export async function closeExpiredDailyOrdersDB(): Promise<number> {
	try {
		const res = await DailyOrder.updateMany(
			{
				status: DailyOrderStatus.ACTIVE,
				cutoffTime: { $lte: new Date() },
			},
			{ $set: { status: DailyOrderStatus.CLOSED } },
		);
		return res.modifiedCount ?? 0;
	} catch {
		return 0;
	}
}

export * from "./types";
