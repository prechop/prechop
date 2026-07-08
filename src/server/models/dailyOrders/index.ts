import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrDailyOrderNotFound, MAX_LIMIT } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { DailyOrderStatus } from "../enums";
import { IOperationType } from "../utils";
import type {
	IDailyOrder,
	IDailyOrderCreateInput,
	IDailyOrderItemInput,
} from "./types";

const collectionName = "dailyOrders";

export type DailyOrderModel = Model<any>;

const addonSchema = new mongoose.Schema(
	{
		name: { type: String, required: true },
		priceKobo: { type: Number, required: true, min: 0 },
		displayOrder: { type: Number, default: 0 },
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
		addons: { type: [addonSchema], default: [] },
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
						addons: {
							$map: {
								input: { $ifNull: ["$$it.addons", []] },
								as: "ad",
								in: {
									$mergeObjects: [
										"$$ad",
										{ id: { $toString: "$$ad._id" } },
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
		addons: (it.addons ?? []).map((a, i) => ({
			name: a.name,
			priceKobo: a.priceKobo,
			displayOrder: a.displayOrder ?? i,
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

export async function listDailyOrdersByVendorDB({
	vendorId,
	status,
	limit = MAX_LIMIT,
	offset = 0,
	session,
}: {
	vendorId: string;
	status?: DailyOrderStatus;
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
	limit = MAX_LIMIT,
	offset = 0,
	session,
}: {
	campusId: string;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IDailyOrder[]> {
	try {
		if (!mongoose.Types.ObjectId.isValid(campusId)) return [];
		return await DailyOrder.aggregate<IDailyOrder>(
			[
				{
					$match: {
						campusId: new mongoose.Types.ObjectId(campusId),
						status: DailyOrderStatus.ACTIVE,
						isPublic: true,
						cutoffTime: { $gt: new Date() },
					},
				},
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

export async function updateDailyOrderDraftDB({
	id,
	vendorId,
	payload,
	session,
}: {
	id: string;
	vendorId: string;
	payload: Partial<IDailyOrderCreateInput>;
	session?: ClientSession;
}): Promise<IDailyOrder | null> {
	try {
		const set: Record<string, unknown> = {};
		if (payload.title !== undefined) set.title = payload.title;
		if (payload.scheduledDate !== undefined)
			set.scheduledDate = payload.scheduledDate;
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

		// Only DRAFT listings are editable — once ACTIVE the snapshots are frozen.
		const res = await DailyOrder.findOneAndUpdate(
			{
				_id: new mongoose.Types.ObjectId(id),
				vendorId: new mongoose.Types.ObjectId(vendorId),
				status: DailyOrderStatus.DRAFT,
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
