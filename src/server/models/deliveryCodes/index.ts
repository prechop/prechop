import mongoose, { type ClientSession, type Model } from "mongoose";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type { IDeliveryCode, IDeliveryCodeCreateInput } from "./types";

const collectionName = "deliveryCodes";

export type DeliveryCodeModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
		},
		code: {
			type: String,
			required: true,
		},
		sequence: {
			type: Number,
			required: true,
			min: 1001,
		},
		assignedOrderId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "buyerOrders",
		},
		assignedAt: { type: Date },
		createdAt: { type: Date, default: Date.now },
	},
	{ timestamps: true },
);

schema.index({ vendorId: 1, code: 1 }, { unique: true });
schema.index({ vendorId: 1, sequence: 1 }, { unique: true });
schema.index({ assignedOrderId: 1 }, { sparse: true });

export const DeliveryCode: DeliveryCodeModel =
	(mongoose.models[collectionName] as DeliveryCodeModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function createDeliveryCodeDB({
	payload,
	session,
}: {
	payload: IDeliveryCodeCreateInput;
	session?: ClientSession;
}): Promise<IDeliveryCode | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new DeliveryCode({
			vendorId: new mongoose.Types.ObjectId(payload.vendorId),
			code: payload.code,
			sequence: payload.sequence,
			assignedOrderId: payload.assignedOrderId
				? new mongoose.Types.ObjectId(payload.assignedOrderId)
				: undefined,
			assignedAt: payload.assignedAt,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createDeliveryCodeDB",
			success: "true",
		});
		return doc.toObject() as unknown as IDeliveryCode;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createDeliveryCodeDB",
			success: "false",
		});
		return null;
	}
}

export async function getDeliveryCodeByCodeDB({
	code,
	session,
}: {
	code: string;
	session?: ClientSession;
}): Promise<IDeliveryCode | null> {
	try {
		const res = await DeliveryCode.findOne({ code: code.trim().toUpperCase() })
			.lean()
			.exec();
		return res ? (res as unknown as IDeliveryCode) : null;
	} catch {
		return null;
	}
}

export async function listDeliveryCodesByVendorDB({
	vendorId,
	limit = 100,
	offset = 0,
	session,
}: {
	vendorId: string;
	limit?: number;
	offset?: number;
	session?: ClientSession;
}): Promise<IDeliveryCode[]> {
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return [];
		return await DeliveryCode.find({ vendorId: new mongoose.Types.ObjectId(vendorId) })
			.sort({ sequence: 1 })
			.skip(offset)
			.limit(limit)
			.lean()
			.exec()
			.then((docs) => docs as unknown as IDeliveryCode[]);
	} catch {
		return [];
	}
}

export async function countDeliveryCodesByVendorDB({
	vendorId,
	session,
}: {
	vendorId: string;
	session?: ClientSession;
}): Promise<number> {
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return 0;
		return DeliveryCode.countDocuments({
			vendorId: new mongoose.Types.ObjectId(vendorId),
		});
	} catch {
		return 0;
	}
}

export * from "./types";
