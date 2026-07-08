import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrResourceNotFound } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import { type ISchool, type ISchoolCreateInput, SCHOOL_TYPES } from "./types";

const collectionName = "schools";

export type SchoolModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		name: { type: String, required: true, unique: true },
		state: { type: String, required: true },
		type: { type: String, enum: SCHOOL_TYPES, required: true },
		isActive: { type: Boolean, default: true },
	},
	{ timestamps: true },
);

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const School: SchoolModel =
	(mongoose.models[collectionName] as SchoolModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

// ── Writes ────────────────────────────────────────────────────────────────

export async function createSchoolDB({
	payload,
	session,
}: {
	payload: ISchoolCreateInput;
	session?: ClientSession;
}): Promise<ISchool | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new School({
			name: payload.name,
			state: payload.state,
			type: payload.type,
			isActive: payload.isActive ?? true,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createSchoolDB",
			success: "true",
		});
		return doc.toObject() as unknown as ISchool;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createSchoolDB",
			success: "false",
		});
		return null;
	}
}

export async function toggleSchoolActiveDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<ISchool | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const current = await School.findById(
			new mongoose.Types.ObjectId(id),
			null,
			{ session },
		).lean<ISchool>();
		if (!current) throw ErrResourceNotFound;
		const res = await School.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { isActive: !current.isActive } },
			{ session, returnDocument: "after" },
		).lean<ISchool>();
		if (!res) throw ErrResourceNotFound;
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "toggleSchoolActiveDB",
			success: "true",
		});
		return { ...res, id: res._id.toString() } as ISchool;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "toggleSchoolActiveDB",
			success: "false",
		});
		return null;
	}
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getSchoolByIdDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<ISchool | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const result =
			(
				await School.aggregate<ISchool>(
					[
						{ $match: { _id: new mongoose.Types.ObjectId(id) } },
						{ $limit: 1 },
					],
					{ session },
				)
			).at(0) ?? null;
		if (!result) throw ErrResourceNotFound;
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getSchoolByIdDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getSchoolByIdDB",
			success: "false",
		});
		return null;
	}
}

export async function listSchoolsDB({
	activeOnly,
	session,
}: {
	activeOnly?: boolean;
	session?: ClientSession;
} = {}): Promise<ISchool[]> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const match: Record<string, unknown> = {};
		if (activeOnly) match.isActive = true;
		const result = await School.aggregate<ISchool>(
			[{ $match: match }, { $sort: { name: 1 } }],
			{ session },
		);
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listSchoolsDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listSchoolsDB",
			success: "false",
		});
		return [];
	}
}

export * from "./types";
