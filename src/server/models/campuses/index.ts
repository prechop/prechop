import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrResourceNotFound } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type { ICampus, ICampusCreateInput } from "./types";

const collectionName = "campuses";

export type CampusModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		name: { type: String, required: true },
		shortCode: {
			type: String,
			required: true,
			unique: true,
			uppercase: true,
			index: true,
		},
		state: { type: String, required: true },
		isActive: { type: Boolean, default: true },
	},
	{ timestamps: true },
);

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const Campus: CampusModel =
	(mongoose.models[collectionName] as CampusModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

/** Escape user input so it's matched as a literal inside a $regex. */
function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Writes ────────────────────────────────────────────────────────────────

export async function createCampusDB({
	payload,
	session,
}: {
	payload: ICampusCreateInput;
	session?: ClientSession;
}): Promise<ICampus | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new Campus({
			name: payload.name,
			shortCode: payload.shortCode,
			state: payload.state,
			isActive: payload.isActive ?? true,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createCampusDB",
			success: "true",
		});
		return doc.toObject() as unknown as ICampus;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createCampusDB",
			success: "false",
		});
		return null;
	}
}

export async function updateCampusDB({
	id,
	payload,
	session,
}: {
	id: string;
	payload: Partial<ICampusCreateInput>;
	session?: ClientSession;
}): Promise<ICampus | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const res = await Campus.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: payload },
			{ session, returnDocument: "after" },
		).lean<ICampus>();
		if (!res) throw ErrResourceNotFound;
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "updateCampusDB",
			success: "true",
		});
		return { ...res, id: res._id.toString() } as ICampus;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "updateCampusDB",
			success: "false",
		});
		return null;
	}
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getCampusByIdDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<ICampus | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const result =
			(
				await Campus.aggregate<ICampus>(
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
			method: "getCampusByIdDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getCampusByIdDB",
			success: "false",
		});
		return null;
	}
}

export async function getCampusByShortCodeDB({
	shortCode,
	session,
}: {
	shortCode: string;
	session?: ClientSession;
}): Promise<ICampus | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const result =
			(
				await Campus.aggregate<ICampus>(
					[
						{ $match: { shortCode: shortCode.toUpperCase() } },
						{ $limit: 1 },
					],
					{ session },
				)
			).at(0) ?? null;
		if (!result) throw ErrResourceNotFound;
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getCampusByShortCodeDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getCampusByShortCodeDB",
			success: "false",
		});
		return null;
	}
}

export async function listCampusesDB({
	activeOnly,
	state,
	session,
}: {
	activeOnly?: boolean;
	/** Restrict to campuses in this state (case-insensitive exact match). */
	state?: string;
	session?: ClientSession;
} = {}): Promise<ICampus[]> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const match: Record<string, unknown> = {};
		if (activeOnly) match.isActive = true;
		if (state?.trim())
			match.state = {
				$regex: `^${escapeRegExp(state.trim())}$`,
				$options: "i",
			};
		const result = await Campus.aggregate<ICampus>(
			[{ $match: match }, { $sort: { name: 1 } }],
			{ session },
		);
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listCampusesDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listCampusesDB",
			success: "false",
		});
		return [];
	}
}

export * from "./types";
