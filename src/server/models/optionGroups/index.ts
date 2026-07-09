import mongoose, { type ClientSession, type Model } from "mongoose";
import { MAX_LIMIT } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type {
	IMenuOptionInput,
	IOptionGroup,
	IOptionGroupCreateInput,
	IOptionGroupUpdateInput,
} from "./types";

const collectionName = "optionGroups";

export type OptionGroupModel = Model<any>;

const optionSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, trim: true },
		priceKobo: { type: Number, required: true, min: 0 },
		displayOrder: { type: Number, default: 0 },
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
		name: { type: String, required: true, trim: true },
		required: { type: Boolean, default: false },
		minSelect: { type: Number, default: 0, min: 0 },
		// null = unlimited
		maxSelect: { type: Number, default: null },
		displayOrder: { type: Number, default: 0 },
		options: { type: [optionSchema], default: [] },
		deleted: { type: Boolean, default: false, select: false },
	},
	{ timestamps: true },
);

const withEmbeddedIds = {
	id: { $toString: "$_id" },
	options: {
		$map: {
			input: { $ifNull: ["$options", []] },
			as: "op",
			in: {
				$mergeObjects: ["$$op", { id: { $toString: "$$op._id" } }],
			},
		},
	},
};

schema.pre("aggregate", function () {
	this.pipeline().unshift({ $match: { deleted: false } });
	this.pipeline().push({ $addFields: withEmbeddedIds });
	this.pipeline().push({ $project: { deleted: 0, __v: 0 } });
});

export const OptionGroup: OptionGroupModel =
	(mongoose.models[collectionName] as OptionGroupModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

function mapOptions(options: IMenuOptionInput[]) {
	return options.map((o, i) => ({
		name: o.name,
		priceKobo: o.priceKobo,
		displayOrder: o.displayOrder ?? i,
	}));
}

export async function createOptionGroupDB({
	payload,
	session,
}: {
	payload: IOptionGroupCreateInput;
	session?: ClientSession;
}): Promise<IOptionGroup | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new OptionGroup({
			vendorId: payload.vendorId,
			campusId: payload.campusId,
			name: payload.name,
			required: payload.required ?? false,
			minSelect: payload.minSelect ?? 0,
			maxSelect: payload.maxSelect ?? null,
			displayOrder: payload.displayOrder ?? 0,
			options: mapOptions(payload.options),
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createOptionGroupDB",
			success: "true",
		});
		return doc.toObject() as unknown as IOptionGroup;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createOptionGroupDB",
			success: "false",
		});
		return null;
	}
}

export async function updateOptionGroupDB({
	id,
	vendorId,
	payload,
	session,
}: {
	id: string;
	vendorId: string;
	payload: IOptionGroupUpdateInput;
	session?: ClientSession;
}): Promise<IOptionGroup | null> {
	try {
		if (
			!mongoose.Types.ObjectId.isValid(id) ||
			!mongoose.Types.ObjectId.isValid(vendorId)
		)
			return null;
		const set: Record<string, unknown> = {};
		if (payload.name !== undefined) set.name = payload.name;
		if (payload.required !== undefined) set.required = payload.required;
		if (payload.minSelect !== undefined) set.minSelect = payload.minSelect;
		if (payload.maxSelect !== undefined) set.maxSelect = payload.maxSelect;
		if (payload.displayOrder !== undefined)
			set.displayOrder = payload.displayOrder;
		if (payload.options !== undefined)
			set.options = mapOptions(payload.options);
		const res = await OptionGroup.findOneAndUpdate(
			{
				_id: new mongoose.Types.ObjectId(id),
				vendorId: new mongoose.Types.ObjectId(vendorId),
				deleted: false,
			},
			{ $set: set },
			{ session, returnDocument: "after" },
		);
		return res ? (res.toObject() as unknown as IOptionGroup) : null;
	} catch {
		return null;
	}
}

export async function softDeleteOptionGroupDB({
	id,
	vendorId,
	session,
}: {
	id: string;
	vendorId: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (
			!mongoose.Types.ObjectId.isValid(id) ||
			!mongoose.Types.ObjectId.isValid(vendorId)
		)
			return false;
		const res = await OptionGroup.findOneAndUpdate(
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

export async function listOptionGroupsByVendorDB({
	vendorId,
	limit = MAX_LIMIT,
	offset = 0,
	session,
}: {
	vendorId: string;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IOptionGroup[]> {
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return [];
		return await OptionGroup.aggregate<IOptionGroup>(
			[
				{ $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
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

export async function getOptionGroupsByIdsDB({
	ids,
	vendorId,
	session,
}: {
	ids: string[];
	vendorId?: string;
	session?: ClientSession;
}): Promise<IOptionGroup[]> {
	try {
		const objectIds = ids
			.filter((id) => mongoose.Types.ObjectId.isValid(id))
			.map((id) => new mongoose.Types.ObjectId(id));
		if (objectIds.length === 0) return [];
		const match: Record<string, unknown> = { _id: { $in: objectIds } };
		if (vendorId && mongoose.Types.ObjectId.isValid(vendorId))
			match.vendorId = new mongoose.Types.ObjectId(vendorId);
		return await OptionGroup.aggregate<IOptionGroup>([{ $match: match }], {
			session,
		});
	} catch {
		return [];
	}
}

export * from "./types";
