import mongoose, { type ClientSession, type Model } from "mongoose";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type { IDeliveryCodeCounter } from "./types";

const collectionName = "deliveryCodeCounters";

export type DeliveryCodeCounterModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			unique: true,
			index: true,
		},
		nextSequence: {
			type: Number,
			required: true,
			default: 1001,
			min: 1001,
		},
	},
	{ timestamps: true },
);

export const DeliveryCodeCounter: DeliveryCodeCounterModel =
	(mongoose.models[collectionName] as DeliveryCodeCounterModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function getDeliveryCodeCounterDB({
	vendorId,
	session,
}: {
	vendorId: string;
	session?: ClientSession;
}): Promise<IDeliveryCodeCounter | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return null;
		const res = await DeliveryCodeCounter.findOne({
			vendorId: new mongoose.Types.ObjectId(vendorId),
		})
			.lean()
			.exec();
		return res ? (res as unknown as IDeliveryCodeCounter) : null;
	} catch {
		return null;
	}
}

export async function createDeliveryCodeCounterDB({
	vendorId,
	nextSequence = 1001,
	session,
}: {
	vendorId: string;
	nextSequence?: number;
	session?: ClientSession;
}): Promise<IDeliveryCodeCounter | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return null;
		const doc = await new DeliveryCodeCounter({
			vendorId: new mongoose.Types.ObjectId(vendorId),
			nextSequence,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createDeliveryCodeCounterDB",
			success: "true",
		});
		return doc.toObject() as unknown as IDeliveryCodeCounter;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createDeliveryCodeCounterDB",
			success: "false",
		});
		return null;
	}
}

export async function allocateDeliveryCodeDB({
	vendorId,
	vendorShortId,
	session,
}: {
	vendorId: string;
	vendorShortId: string;
	session?: ClientSession;
}): Promise<{ code: string; sequence: number } | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return null;
		const objectId = new mongoose.Types.ObjectId(vendorId);
		const prefix = vendorShortId.trim().toUpperCase().slice(0, 3);

		const updated = await DeliveryCodeCounter.findOneAndUpdate(
			{ vendorId: objectId },
			{ $inc: { nextSequence: 1 } },
			{ new: true, upsert: true, session },
		).lean();

		if (!updated) {
			timer({
				operation: IOperationType.Update,
				collection: collectionName,
				method: "allocateDeliveryCodeDB",
				success: "false",
			});
			return null;
		}

		const sequence = updated.nextSequence;
		const code = `${prefix}${sequence}`;

		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "allocateDeliveryCodeDB",
			success: "true",
		});

		return { code, sequence };
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "allocateDeliveryCodeDB",
			success: "false",
		});
		return null;
	}
}

export * from "./types";
