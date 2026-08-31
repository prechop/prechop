import mongoose, { type ClientSession, type Model } from "mongoose";
import { databaseResponseTimeHistogram } from "../../metrics";
import { ErrResourceNotFound } from "../../constants";
import { MealTime, VendorStatus } from "../enums";
import { IOperationType } from "../utils";
import type { IDeliveryWindow, IDeliveryWindowCreateInput } from "./types";

const collectionName = "deliveryWindows";

export type DeliveryWindowModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
		},
		name: { type: String },
		mealTime: {
			type: String,
			enum: Object.values(MealTime),
			required: true,
		},
		orderWindowStart: { type: String, required: true },
		orderWindowEnd: { type: String, required: true },
		deliveryWindowStart: { type: String, required: true },
		deliveryWindowEnd: { type: String, required: true },
		capacity: { type: Number, required: true, min: 1 },
		active: { type: Boolean, default: true },
	},
	{ timestamps: true },
);

schema.index({ vendorId: 1, mealTime: 1 });
schema.index({ vendorId: 1, active: 1 });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const DeliveryWindow: DeliveryWindowModel =
	(mongoose.models[collectionName] as DeliveryWindowModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function createDeliveryWindowDB({
	payload,
	session,
}: {
	payload: IDeliveryWindowCreateInput;
	session?: ClientSession;
}): Promise<IDeliveryWindow | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new DeliveryWindow({
			vendorId: payload.vendorId,
			name: payload.name,
			mealTime: payload.mealTime,
			orderWindowStart: payload.orderWindowStart,
			orderWindowEnd: payload.orderWindowEnd,
			deliveryWindowStart: payload.deliveryWindowStart,
			deliveryWindowEnd: payload.deliveryWindowEnd,
			capacity: payload.capacity,
			active: payload.active ?? true,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createDeliveryWindowDB",
			success: "true",
		});
		return doc.toObject() as unknown as IDeliveryWindow;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createDeliveryWindowDB",
			success: "false",
		});
		return null;
	}
}

export async function getDeliveryWindowByIdDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IDeliveryWindow | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		return (
			(
				await DeliveryWindow.aggregate<IDeliveryWindow>(
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

export async function listDeliveryWindowsByVendorDB({
	vendorId,
	session,
}: {
	vendorId: string;
	session?: ClientSession;
}): Promise<IDeliveryWindow[]> {
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return [];
		return await DeliveryWindow.aggregate<IDeliveryWindow>(
			[
				{ $match: { vendorId: new mongoose.Types.ObjectId(vendorId) } },
				{ $sort: { mealTime: 1, createdAt: 1 } },
			],
			{ session },
		);
	} catch {
		return [];
	}
}

export async function updateDeliveryWindowDB({
	id,
	vendorId,
	payload,
	session,
}: {
	id: string;
	vendorId: string;
	payload: Partial<IDeliveryWindowCreateInput>;
	session?: ClientSession;
}): Promise<IDeliveryWindow | null> {
	try {
		const filter: Record<string, unknown> = {
			_id: new mongoose.Types.ObjectId(id),
		};
		if (vendorId) filter.vendorId = new mongoose.Types.ObjectId(vendorId);
		const res = await DeliveryWindow.findOneAndUpdate(
			filter,
			{ $set: payload },
			{ session, returnDocument: "after" },
		);
		if (!res) throw ErrResourceNotFound;
		return res.toObject() as unknown as IDeliveryWindow;
	} catch {
		return null;
	}
}

export async function deleteDeliveryWindowDB({
	id,
	vendorId,
	session,
}: {
	id: string;
	vendorId: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const res = await DeliveryWindow.deleteOne({
			_id: new mongoose.Types.ObjectId(id),
			vendorId: new mongoose.Types.ObjectId(vendorId),
		});
		return res.deletedCount > 0;
	} catch {
		return false;
	}
}

export * from "./types";
