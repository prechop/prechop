import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrResourceNotFound } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type { IRefund, IRefundCreateInput } from "./types";

const collectionName = "refunds";

export type RefundModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		paymentId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "payments",
			required: true,
			unique: true,
		},
		// Integer kobo.
		amountKobo: { type: Number, required: true },
		reason: { type: String, required: true },
		paystackRefundId: { type: String, required: false },
		processedAt: { type: Date, required: false },
	},
	{ timestamps: true },
);

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const Refund: RefundModel =
	(mongoose.models[collectionName] as RefundModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

// ── Writes ────────────────────────────────────────────────────────────────

export async function createRefundDB({
	payload,
	session,
}: {
	payload: IRefundCreateInput;
	session?: ClientSession;
}): Promise<IRefund | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new Refund({
			paymentId: payload.paymentId,
			amountKobo: payload.amountKobo,
			reason: payload.reason,
			paystackRefundId: payload.paystackRefundId,
			processedAt: payload.processedAt,
		}).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createRefundDB",
			success: "true",
		});
		return doc.toObject() as unknown as IRefund;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createRefundDB",
			success: "false",
		});
		return null;
	}
}

export async function markRefundProcessedDB({
	id,
	paystackRefundId,
	session,
}: {
	id: string;
	paystackRefundId: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const res = await Refund.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{ $set: { paystackRefundId, processedAt: new Date() } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getRefundByPaymentIdDB({
	paymentId,
	session,
}: {
	paymentId: string;
	session?: ClientSession;
}): Promise<IRefund | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(paymentId)) return null;
		const result =
			(
				await Refund.aggregate<IRefund>(
					[
						{
							$match: {
								paymentId: new mongoose.Types.ObjectId(
									paymentId,
								),
							},
						},
						{ $limit: 1 },
					],
					{ session },
				)
			).at(0) ?? null;
		if (!result) throw ErrResourceNotFound;
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getRefundByPaymentIdDB",
			success: "true",
		});
		return result;
	} catch {
		timer({
			operation: IOperationType.Read,
			collection: collectionName,
			method: "getRefundByPaymentIdDB",
			success: "false",
		});
		return null;
	}
}

export * from "./types";
