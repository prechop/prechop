import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrResourceNotFound } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { DayOfWeek } from "../enums";
import { IOperationType } from "../utils";
import type { ITimetableEntry } from "./types";

const collectionName = "timetableEntries";

export type TimetableEntryModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
		},
		menuItemId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "menuItems",
			required: true,
		},
		dayOfWeek: {
			type: String,
			enum: Object.values(DayOfWeek),
			required: true,
		},
		isOpen: { type: Boolean, default: true },
	},
	{ timestamps: true },
);

// One entry per vendor / menu item / day.
schema.index({ vendorId: 1, menuItemId: 1, dayOfWeek: 1 }, { unique: true });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const TimetableEntry: TimetableEntryModel =
	(mongoose.models[collectionName] as TimetableEntryModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

// ── Writes ────────────────────────────────────────────────────────────────

export async function upsertTimetableEntryDB({
	vendorId,
	menuItemId,
	dayOfWeek,
	isOpen = true,
	session,
}: {
	vendorId: string;
	menuItemId: string;
	dayOfWeek: DayOfWeek;
	isOpen?: boolean;
	session?: ClientSession;
}): Promise<ITimetableEntry | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (
			!mongoose.Types.ObjectId.isValid(vendorId) ||
			!mongoose.Types.ObjectId.isValid(menuItemId)
		) {
			return null;
		}
		const res = await TimetableEntry.findOneAndUpdate(
			{
				vendorId: new mongoose.Types.ObjectId(vendorId),
				menuItemId: new mongoose.Types.ObjectId(menuItemId),
				dayOfWeek,
			},
			{ $set: { isOpen } },
			{
				session,
				upsert: true,
				returnDocument: "after",
				setDefaultsOnInsert: true,
			},
		).lean<ITimetableEntry>();
		if (!res) throw ErrResourceNotFound;
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "upsertTimetableEntryDB",
			success: "true",
		});
		return { ...res, id: res._id.toString() } as ITimetableEntry;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "upsertTimetableEntryDB",
			success: "false",
		});
		return null;
	}
}

export async function deleteTimetableEntryDB({
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
		) {
			return false;
		}
		const res = await TimetableEntry.deleteOne(
			{
				_id: new mongoose.Types.ObjectId(id),
				vendorId: new mongoose.Types.ObjectId(vendorId),
			},
			{ session },
		);
		return res.deletedCount > 0;
	} catch {
		return false;
	}
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function listTimetableByVendorDB({
	vendorId,
	session,
}: {
	vendorId: string;
	session?: ClientSession;
}): Promise<ITimetableEntry[]> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return [];
		const result = await TimetableEntry.aggregate<ITimetableEntry>(
			[
				{ $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
				{ $sort: { menuItemId: 1, dayOfWeek: 1 } },
			],
			{ session },
		);
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listTimetableByVendorDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "listTimetableByVendorDB",
			success: "false",
		});
		return [];
	}
}

export async function hasAnyTimetableEntryDB({
	vendorId,
	session,
}: {
	vendorId: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return false;
		const count = await TimetableEntry.countDocuments(
			{ vendorId: new mongoose.Types.ObjectId(vendorId) },
			{ session },
		);
		return count > 0;
	} catch {
		return false;
	}
}

export * from "./types";
