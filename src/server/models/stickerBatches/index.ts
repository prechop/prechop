import mongoose, { type ClientSession, type Model } from "mongoose";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type { IStickerBatch, IStickerBatchCreateInput } from "./types";

const collectionName = "stickerBatches";

export type StickerBatchModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
		},
		batchLabel: {
			type: String,
			required: true,
		},
		startCode: {
			type: String,
			required: true,
		},
		endCode: {
			type: String,
			required: true,
		},
		startSequence: {
			type: Number,
			required: true,
			min: 1001,
		},
		endSequence: {
			type: Number,
			required: true,
		},
		quantity: {
			type: Number,
			required: true,
			min: 1,
		},
		status: {
			type: String,
			enum: ["ACTIVE", "EXHAUSTED"],
			default: "ACTIVE",
			index: true,
		},
		notes: { type: String },
		printedAt: { type: Date },
		shippedAt: { type: Date },
		completedAt: { type: Date },
	},
	{ timestamps: true },
);

schema.index({ vendorId: 1, startSequence: 1 });

export const StickerBatch: StickerBatchModel =
	(mongoose.models[collectionName] as StickerBatchModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function createStickerBatchDB({
	payload,
	session,
}: {
	payload: IStickerBatchCreateInput;
	session?: ClientSession;
}): Promise<IStickerBatch | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const lastBatch = await StickerBatch.findOne({
			vendorId: new mongoose.Types.ObjectId(payload.vendorId),
		})
			.sort({ startSequence: -1 })
			.lean()
			.exec();
		if (lastBatch && payload.startSequence <= lastBatch.endSequence) {
			throw new Error(
				`Batch start sequence ${payload.startSequence} must continue after the vendor's last batch end sequence ${lastBatch.endSequence}`,
			);
		}

		const quantity = payload.endSequence - payload.startSequence + 1;
		const doc = await new StickerBatch({
			vendorId: new mongoose.Types.ObjectId(payload.vendorId),
			batchLabel: payload.batchLabel,
			startCode: payload.startCode,
			endCode: payload.endCode,
			startSequence: payload.startSequence,
			endSequence: payload.endSequence,
			quantity,
			status: payload.status ?? "ACTIVE",
			notes: payload.notes,
			printedAt: payload.printedAt ? new Date(payload.printedAt) : undefined,
			shippedAt: payload.shippedAt ? new Date(payload.shippedAt) : undefined,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createStickerBatchDB",
			success: "true",
		});
		return doc.toObject() as unknown as IStickerBatch;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createStickerBatchDB",
			success: "false",
		});
		return null;
	}
}

export async function listStickerBatchesByVendorDB({
	vendorId,
	session,
}: {
	vendorId: string;
	session?: ClientSession;
}): Promise<IStickerBatch[]> {
	try {
		if (!mongoose.Types.ObjectId.isValid(vendorId)) return [];
		const docs = await StickerBatch.find({
			vendorId: new mongoose.Types.ObjectId(vendorId),
		})
			.sort({ startSequence: 1 })
			.lean()
			.exec();
		return docs as unknown as IStickerBatch[];
	} catch {
		return [];
	}
}

export async function markStickerBatchExhaustedDB({
	id,
	vendorId,
	session,
}: {
	id: string;
	vendorId: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await StickerBatch.findOneAndUpdate(
			{ _id: new mongoose.Types.ObjectId(id), vendorId: new mongoose.Types.ObjectId(vendorId) },
			{ $set: { status: "EXHAUSTED", completedAt: new Date() } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export * from "./types";
