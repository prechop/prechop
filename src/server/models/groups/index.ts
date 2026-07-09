import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrGroupNotFound } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type { IGroup, IGroupCreateInput } from "./types";

const collectionName = "groups";

export type GroupModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		name: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			index: true,
		},
		description: { type: String, required: false },
		policyIds: {
			type: [{ type: mongoose.Schema.Types.ObjectId, ref: "policies" }],
			default: [],
		},
		isBuiltIn: { type: Boolean, default: false, index: true },
		deleted: { type: Boolean, default: false, select: false },
	},
	{ timestamps: true },
);

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const Group: GroupModel =
	(mongoose.models[collectionName] as GroupModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

// ── Writes ────────────────────────────────────────────────────────────────

export async function createGroupDB({
	payload,
	session,
}: {
	payload: IGroupCreateInput;
	session?: ClientSession;
}): Promise<IGroup | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new Group({
			name: payload.name,
			description: payload.description,
			policyIds: (payload.policyIds ?? []).map(
				(p) => new mongoose.Types.ObjectId(p),
			),
			isBuiltIn: payload.isBuiltIn ?? false,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createGroupDB",
			success: "true",
		});
		return doc.toObject() as unknown as IGroup;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createGroupDB",
			success: "false",
		});
		return null;
	}
}

export async function updateGroupDB({
	id,
	payload,
	session,
}: {
	id: string;
	payload: { name?: string; description?: string; policyIds?: string[] };
	session?: ClientSession;
}): Promise<IGroup | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const update: Record<string, unknown> = {};
		if (payload.name !== undefined) update.name = payload.name;
		if (payload.description !== undefined)
			update.description = payload.description;
		if (payload.policyIds !== undefined)
			update.policyIds = payload.policyIds.map(
				(p) => new mongoose.Types.ObjectId(p),
			);
		const res = await Group.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: update },
			{ session, returnDocument: "after" },
		).lean<IGroup>();
		if (!res) throw ErrGroupNotFound;
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "updateGroupDB",
			success: "true",
		});
		return { ...res, id: res._id.toString() } as IGroup;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "updateGroupDB",
			success: "false",
		});
		return null;
	}
}

export async function softDeleteGroupDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<boolean> {
	if (!mongoose.Types.ObjectId.isValid(id)) return false;
	const res = await Group.findByIdAndUpdate(
		new mongoose.Types.ObjectId(id),
		{ $set: { deleted: true } },
		{ session, returnDocument: "after" },
	).lean();
	return !!res;
}

/** Idempotent upsert used by the IAM seed for built-in groups. */
export async function upsertBuiltInGroupDB({
	name,
	description,
	policyIds,
	session,
}: {
	name: string;
	description?: string;
	policyIds: string[];
	session?: ClientSession;
}): Promise<IGroup | null> {
	const res = await Group.findOneAndUpdate(
		{ name },
		{
			$set: {
				description,
				policyIds: policyIds.map((p) => new mongoose.Types.ObjectId(p)),
				isBuiltIn: true,
				deleted: false,
			},
		},
		{ session, upsert: true, returnDocument: "after" },
	).lean<IGroup>();
	return res ? ({ ...res, id: res._id.toString() } as IGroup) : null;
}

/** Pull a policy from every group that references it (used on policy delete). */
export async function removePolicyFromAllGroupsDB({
	policyId,
	session,
}: {
	policyId: string;
	session?: ClientSession;
}): Promise<number> {
	if (!mongoose.Types.ObjectId.isValid(policyId)) return 0;
	const res = await Group.updateMany(
		{ policyIds: new mongoose.Types.ObjectId(policyId) },
		{ $pull: { policyIds: new mongoose.Types.ObjectId(policyId) } },
		{ session },
	);
	return res.modifiedCount ?? 0;
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getGroupByIdDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IGroup | null> {
	if (!mongoose.Types.ObjectId.isValid(id)) return null;
	return (
		(
			await Group.aggregate<IGroup>(
				[
					{
						$match: {
							_id: new mongoose.Types.ObjectId(id),
							deleted: { $ne: true },
						},
					},
					{ $limit: 1 },
				],
				{ session },
			)
		).at(0) ?? null
	);
}

export async function getGroupByNameDB({
	name,
	session,
}: {
	name: string;
	session?: ClientSession;
}): Promise<IGroup | null> {
	return (
		(
			await Group.aggregate<IGroup>(
				[{ $match: { name, deleted: { $ne: true } } }, { $limit: 1 }],
				{ session },
			)
		).at(0) ?? null
	);
}

export async function listGroupsDB({
	ids,
	session,
}: {
	ids?: string[];
	session?: ClientSession;
} = {}): Promise<IGroup[]> {
	const match: Record<string, unknown> = { deleted: { $ne: true } };
	if (ids) {
		match._id = {
			$in: ids
				.filter((i) => mongoose.Types.ObjectId.isValid(i))
				.map((i) => new mongoose.Types.ObjectId(i)),
		};
	}
	return Group.aggregate<IGroup>(
		[{ $match: match }, { $sort: { name: 1 } }],
		{
			session,
		},
	);
}

export * from "./types";
