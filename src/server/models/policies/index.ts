import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrPolicyNotFound } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type { IPolicy, IPolicyCreateInput, IPolicyStatement } from "./types";

const collectionName = "policies";

export type PolicyModel = Model<any>;

const statementSchema = new mongoose.Schema<any>(
	{
		effect: { type: String, enum: ["Allow", "Deny"], required: true },
		actions: { type: [String], required: true, default: [] },
		resources: { type: [String], required: false },
		condition: { type: Map, of: String, required: false },
	},
	{ _id: false },
);

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
		statements: { type: [statementSchema], required: true, default: [] },
		isBuiltIn: { type: Boolean, default: false, index: true },
		deleted: { type: Boolean, default: false, select: false },
	},
	{ timestamps: true },
);

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const Policy: PolicyModel =
	(mongoose.models[collectionName] as PolicyModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

// ── Writes ────────────────────────────────────────────────────────────────

export async function createPolicyDB({
	payload,
	session,
}: {
	payload: IPolicyCreateInput;
	session?: ClientSession;
}): Promise<IPolicy | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new Policy({
			name: payload.name,
			description: payload.description,
			statements: payload.statements,
			isBuiltIn: payload.isBuiltIn ?? false,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createPolicyDB",
			success: "true",
		});
		return doc.toObject() as unknown as IPolicy;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createPolicyDB",
			success: "false",
		});
		return null;
	}
}

export async function updatePolicyDB({
	id,
	payload,
	session,
}: {
	id: string;
	payload: Partial<Pick<IPolicyCreateInput, "description" | "statements">> & {
		name?: string;
	};
	session?: ClientSession;
}): Promise<IPolicy | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const res = await Policy.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: payload },
			{ session, returnDocument: "after" },
		).lean<IPolicy>();
		if (!res) throw ErrPolicyNotFound;
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "updatePolicyDB",
			success: "true",
		});
		return { ...res, id: res._id.toString() } as IPolicy;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "updatePolicyDB",
			success: "false",
		});
		return null;
	}
}

export async function softDeletePolicyDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<boolean> {
	if (!mongoose.Types.ObjectId.isValid(id)) return false;
	const res = await Policy.findByIdAndUpdate(
		new mongoose.Types.ObjectId(id),
		{ $set: { deleted: true } },
		{ session, returnDocument: "after" },
	).lean();
	return !!res;
}

/** Idempotent upsert used by the IAM seed for built-in policies. */
export async function upsertBuiltInPolicyDB({
	name,
	description,
	statements,
	session,
}: {
	name: string;
	description?: string;
	statements: IPolicyStatement[];
	session?: ClientSession;
}): Promise<IPolicy | null> {
	const res = await Policy.findOneAndUpdate(
		{ name },
		{
			$set: { description, statements, isBuiltIn: true, deleted: false },
		},
		{ session, upsert: true, returnDocument: "after" },
	).lean<IPolicy>();
	return res ? ({ ...res, id: res._id.toString() } as IPolicy) : null;
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getPolicyByIdDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IPolicy | null> {
	if (!mongoose.Types.ObjectId.isValid(id)) return null;
	const result =
		(
			await Policy.aggregate<IPolicy>(
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
		).at(0) ?? null;
	return result;
}

export async function getPolicyByNameDB({
	name,
	session,
}: {
	name: string;
	session?: ClientSession;
}): Promise<IPolicy | null> {
	const result =
		(
			await Policy.aggregate<IPolicy>(
				[{ $match: { name, deleted: { $ne: true } } }, { $limit: 1 }],
				{ session },
			)
		).at(0) ?? null;
	return result;
}

export async function listPoliciesDB({
	ids,
	session,
}: {
	ids?: string[];
	session?: ClientSession;
} = {}): Promise<IPolicy[]> {
	const match: Record<string, unknown> = { deleted: { $ne: true } };
	if (ids) {
		match._id = {
			$in: ids
				.filter((i) => mongoose.Types.ObjectId.isValid(i))
				.map((i) => new mongoose.Types.ObjectId(i)),
		};
	}
	return Policy.aggregate<IPolicy>(
		[{ $match: match }, { $sort: { name: 1 } }],
		{ session },
	);
}

export * from "./types";
