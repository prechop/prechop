import mongoose, { type ClientSession, type Model } from "mongoose";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type {
	IFulfillmentLocation,
	IFulfillmentLocationCreateInput,
} from "./types";

const collectionName = "fulfillmentLocations";

export type FulfillmentLocationModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		name: { type: String, required: true, trim: true },
		state: { type: String, trim: true },
		city: { type: String, trim: true },
		campusOrSchool: { type: String, trim: true },
		address: { type: String, trim: true },
		isActive: { type: Boolean, default: true, index: true },
	},
	{ timestamps: true },
);

schema.index({ name: 1 }, { unique: true, sparse: true });

export const FulfillmentLocation: FulfillmentLocationModel =
	(mongoose.models[collectionName] as FulfillmentLocationModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function createFulfillmentLocationDB({
	payload,
	session,
}: {
	payload: IFulfillmentLocationCreateInput;
	session?: ClientSession;
}): Promise<IFulfillmentLocation | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new FulfillmentLocation({
			name: payload.name,
			state: payload.state,
			city: payload.city,
			campusOrSchool: payload.campusOrSchool,
			address: payload.address,
			isActive: payload.isActive ?? true,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createFulfillmentLocationDB",
			success: "true",
		});
		return doc.toObject() as unknown as IFulfillmentLocation;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createFulfillmentLocationDB",
			success: "false",
		});
		return null;
	}
}

export async function listFulfillmentLocationsDB(): Promise<
	IFulfillmentLocation[]
> {
	try {
		const docs = await FulfillmentLocation.find({})
			.sort({ name: 1 })
			.lean()
			.exec();
		return docs as unknown as IFulfillmentLocation[];
	} catch {
		return [];
	}
}

export async function getFulfillmentLocationByIdDB({
	id,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IFulfillmentLocation | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const doc = await FulfillmentLocation.findById(
			new mongoose.Types.ObjectId(id),
		)
			.lean()
			.exec();
		return (doc as unknown as IFulfillmentLocation) ?? null;
	} catch {
		return null;
	}
}

export async function updateFulfillmentLocationDB({
	id,
	payload,
	session,
}: {
	id: string;
	payload: Partial<IFulfillmentLocationCreateInput>;
	session?: ClientSession;
}): Promise<IFulfillmentLocation | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const res = await FulfillmentLocation.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: payload },
			{ session, returnDocument: "after", strict: false },
		)
			.lean()
			.exec();
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "updateFulfillmentLocationDB",
			success: res ? "true" : "false",
		});
		return (res as unknown as IFulfillmentLocation) ?? null;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "updateFulfillmentLocationDB",
			success: "false",
		});
		return null;
	}
}

export async function deleteFulfillmentLocationDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<boolean> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const res = await FulfillmentLocation.deleteOne({
			_id: new mongoose.Types.ObjectId(id),
		});
		timer({
			operation: IOperationType.Delete,
			collection: collectionName,
			method: "deleteFulfillmentLocationDB",
			success: res.deletedCount > 0 ? "true" : "false",
		});
		return res.deletedCount > 0;
	} catch {
		timer({
			operation: IOperationType.Delete,
			collection: collectionName,
			method: "deleteFulfillmentLocationDB",
			success: "false",
		});
		return false;
	}
}

export * from "./types";
