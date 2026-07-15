import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrMenuItemNotFound, MAX_LIMIT } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { MenuCategory, VendorStatus } from "../enums";
import { IOperationType } from "../utils";
import type { IMenuItem, IMenuItemCreateInput } from "./types";

const collectionName = "menuItems";

export type MenuItemModel = Model<any>;

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
		category: {
			type: String,
			enum: Object.values(MenuCategory),
			required: true,
		},
		name: { type: String, required: true, trim: true },
		description: { type: String },
		priceKobo: { type: Number, required: true, min: 0 },
		imageUrl: { type: String },
		estimatedPrepMin: { type: Number, default: 20 },
		isAvailable: { type: Boolean, default: true },
		isSoldOut: { type: Boolean, default: false },
		displayOrder: { type: Number, default: 0 },
		optionGroupIds: {
			type: [mongoose.Schema.Types.ObjectId],
			ref: "optionGroups",
			default: [],
		},
		deleted: { type: Boolean, default: false, select: false },
	},
	{ timestamps: true },
);

// Nightly sold-out reset (resetSoldOutMenuItemsDB). Partial, so the index only
// ever holds the handful of currently-sold-out items instead of the whole
// catalog: measured at 6k items it turns a 6000-doc COLLSCAN into a 30-key
// IXSCAN. Write cost is negligible — entries appear/disappear only when a
// vendor actually flips isSoldOut, not on every menu edit.
schema.index(
	{ isSoldOut: 1 },
	{ partialFilterExpression: { isSoldOut: true } },
);

schema.pre("aggregate", function () {
	this.pipeline().unshift({ $match: { deleted: false } });
	this.pipeline().push({
		$addFields: {
			id: { $toString: "$_id" },
			optionGroupIds: {
				$map: {
					input: { $ifNull: ["$optionGroupIds", []] },
					as: "g",
					in: { $toString: "$$g" },
				},
			},
		},
	});
	this.pipeline().push({ $project: { deleted: 0, __v: 0 } });
});

export const MenuItem: MenuItemModel =
	(mongoose.models[collectionName] as MenuItemModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function createMenuItemDB({
	payload,
	session,
}: {
	payload: IMenuItemCreateInput;
	session?: ClientSession;
}): Promise<IMenuItem | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new MenuItem(payload).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createMenuItemDB",
			success: "true",
		});
		return doc.toObject() as unknown as IMenuItem;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createMenuItemDB",
			success: "false",
		});
		return null;
	}
}

export async function updateMenuItemDB({
	id,
	vendorId,
	payload,
	session,
}: {
	id: string;
	vendorId: string;
	payload: Partial<IMenuItem>;
	session?: ClientSession;
}): Promise<IMenuItem | null> {
	try {
		const res = await MenuItem.findOneAndUpdate(
			{
				_id: new mongoose.Types.ObjectId(id),
				vendorId: new mongoose.Types.ObjectId(vendorId),
				deleted: false,
			},
			{ $set: payload },
			{ session, returnDocument: "after" },
		);
		if (!res) throw ErrMenuItemNotFound;
		return res.toObject() as unknown as IMenuItem;
	} catch {
		return null;
	}
}

export async function softDeleteMenuItemDB({
	id,
	vendorId,
	session,
}: {
	id: string;
	vendorId: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await MenuItem.findOneAndUpdate(
			{
				_id: new mongoose.Types.ObjectId(id),
				vendorId: new mongoose.Types.ObjectId(vendorId),
			},
			{ $set: { deleted: true } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function getMenuItemByIdDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IMenuItem | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		return (
			(
				await MenuItem.aggregate<IMenuItem>(
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

export async function listMenuItemsByVendorDB({
	vendorId,
	category,
	availableOnly,
	limit = MAX_LIMIT,
	offset = 0,
	session,
}: {
	vendorId: string;
	category?: MenuCategory;
	availableOnly?: boolean;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IMenuItem[]> {
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return [];
		const match: Record<string, unknown> = {
			vendorId: new mongoose.Types.ObjectId(vendorId),
		};
		if (category) match.category = category;
		if (availableOnly) match.isAvailable = true;
		return await MenuItem.aggregate<IMenuItem>(
			[
				{ $match: match },
				{ $sort: { displayOrder: 1, createdAt: 1 } },
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
 * Distinct vendorIds within `campusIds` that have an available menu item whose
 * name matches `q` (case-insensitive, literal). Powers the marketplace search's
 * "by menu" dimension.
 */
export async function findVendorIdsByMenuSearchDB({
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
		const rows = await MenuItem.aggregate<{ _id: mongoose.Types.ObjectId }>(
			[
				{
					$match: {
						isAvailable: true,
						name: {
							$regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
							$options: "i",
						},
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
			],
		);
		return rows.map((r) => r._id.toString());
	} catch {
		return [];
	}
}

/** Admin cross-vendor catalog listing with optional campus/text filters. */
export async function listAllMenuItemsDB({
	campusId,
	search,
	skip = 0,
	limit = 50,
	session,
}: {
	campusId?: string;
	search?: string;
	skip?: number;
	limit?: number;
	session?: ClientSession;
} = {}): Promise<{ items: IMenuItem[]; total: number }> {
	const match: Record<string, unknown> = { deleted: false };
	if (campusId && mongoose.Types.ObjectId.isValid(campusId))
		match.campusId = new mongoose.Types.ObjectId(campusId);
	if (search)
		match.name = {
			$regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
			$options: "i",
		};
	const [items, total] = await Promise.all([
		MenuItem.aggregate<IMenuItem>(
			[
				{ $match: match },
				{
					$lookup: {
						from: "vendorprofiles",
						localField: "vendorId",
						foreignField: "_id",
						as: "_vendor",
					},
				},
				{
					$unwind: {
						path: "$_vendor",
						preserveNullAndEmptyArrays: true,
					},
				},
				{
					$lookup: {
						from: "campuses",
						localField: "campusId",
						foreignField: "_id",
						as: "_campus",
					},
				},
				{
					$unwind: {
						path: "$_campus",
						preserveNullAndEmptyArrays: true,
					},
				},
				{
					$addFields: {
						vendorName: "$_vendor.businessName",
						vendorStatus: "$_vendor.status",
						vendorLocationType: "$_vendor.locationType",
						vendorState: "$_vendor.state",
						vendorAreaOrAddress: "$_vendor.areaOrAddress",
						campusName: "$_campus.name",
						campusState: "$_campus.state",
					},
				},
				{ $sort: { createdAt: -1 } },
				{ $skip: skip },
				{ $limit: Math.min(limit, 100) },
				{ $unset: ["_vendor", "_campus"] },
			],
			{ session },
		),
		MenuItem.countDocuments(match, { session }),
	]);
	return { items, total };
}

/** Admin takedown / restore of any vendor's menu item. */
export async function adminSetMenuAvailabilityDB({
	id,
	isAvailable,
	session,
}: {
	id: string;
	isAvailable: boolean;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const res = await MenuItem.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { isAvailable } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

/**
 * Nightly reset: clear `isSoldOut` so every menu item is orderable again on the
 * new business day. Without this a vendor who sells out once stays sold out
 * forever — nothing else in the system ever clears the flag.
 *
 * Call this at **00:00 Africa/Lagos** (`PLATFORM_TIMEZONE`), not at server
 * midnight: on a UTC host, server midnight is 01:00 Lagos and items would stay
 * dark for the first hour of every day. The cron must pin the timezone
 * explicitly — see HANDOFF.
 *
 * The filter is the guard: `isSoldOut: true` means this is a conditional write
 * that only touches rows that actually need it, so a re-run (or two instances
 * racing) is idempotent and writes nothing the second time. Returns the number
 * of items actually reset, which is 0 on a no-op run.
 *
 * `campusId` is optional and exists for the day Prechop spans more than one
 * timezone; today every campus is Nigerian, so the cron calls this with no
 * argument to reset all campuses in one write.
 */
export async function resetSoldOutMenuItemsDB({
	campusId,
	session,
}: {
	campusId?: string;
	session?: ClientSession;
} = {}): Promise<number> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const filter: Record<string, unknown> = {
			isSoldOut: true,
			deleted: false,
		};
		if (campusId) {
			if (!mongoose.Types.ObjectId.isValid(campusId)) return 0;
			filter.campusId = new mongoose.Types.ObjectId(campusId);
		}
		const res = await MenuItem.updateMany(
			filter,
			{ $set: { isSoldOut: false } },
			{ session },
		);
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "resetSoldOutMenuItemsDB",
			success: "true",
		});
		return res.modifiedCount ?? 0;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "resetSoldOutMenuItemsDB",
			success: "false",
		});
		return 0;
	}
}

export async function countMenuItemsByVendorDB({
	vendorId,
	session,
}: {
	vendorId: string;
	session?: ClientSession;
}): Promise<number> {
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return 0;
		return await MenuItem.countDocuments({
			vendorId: new mongoose.Types.ObjectId(vendorId),
			deleted: false,
		}).session(session ?? null);
	} catch {
		return 0;
	}
}

export async function getMenuItemsByIdsDB({
	ids,
	session,
}: {
	ids: string[];
	session?: ClientSession;
}): Promise<IMenuItem[]> {
	try {
		return await MenuItem.aggregate<IMenuItem>(
			[
				{
					$match: {
						_id: {
							$in: ids
								.filter((id) =>
									mongoose.Types.ObjectId.isValid(id),
								)
								.map((id) => new mongoose.Types.ObjectId(id)),
						},
					},
				},
			],
			{ session },
		);
	} catch {
		return [];
	}
}

export * from "./types";
