import mongoose, { type ClientSession, type Model } from "mongoose";
import { databaseResponseTimeHistogram } from "../../metrics";
import { PaymentStatus } from "../enums";
import { IOperationType } from "../utils";
import type { IPayment, IPaymentCreateInput } from "./types";

const collectionName = "payments";

export type PaymentModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		buyerOrderId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "buyerOrders",
			required: true,
			unique: true,
		},
		buyerId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "users",
			required: true,
		},
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
		},
		paystackRef: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		paystackAccessCode: { type: String },
		amountKobo: { type: Number, required: true },
		platformFeeKobo: { type: Number, required: true },
		vendorAmountKobo: { type: Number, required: true },
		status: {
			type: String,
			enum: Object.values(PaymentStatus),
			default: PaymentStatus.INITIALIZED,
		},
		channel: { type: String },
		paidAt: { type: Date },
		webhookVerified: { type: Boolean, default: false },
		idempotencyKey: { type: String, required: true, unique: true },
	},
	{ timestamps: true },
);

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const Payment: PaymentModel =
	(mongoose.models[collectionName] as PaymentModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function createPaymentDB({
	payload,
	session,
}: {
	payload: IPaymentCreateInput;
	session?: ClientSession;
}): Promise<IPayment | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const doc = await new Payment(payload).save({ session });
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createPaymentDB",
			success: "true",
		});
		return doc.toObject() as unknown as IPayment;
	} catch {
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createPaymentDB",
			success: "false",
		});
		return null;
	}
}

export async function getPaymentByRefDB({
	paystackRef,
	session,
}: {
	paystackRef: string;
	session?: ClientSession;
}): Promise<IPayment | null> {
	try {
		return (
			(
				await Payment.aggregate<IPayment>(
					[{ $match: { paystackRef } }, { $limit: 1 }],
					{ session },
				)
			).at(0) ?? null
		);
	} catch {
		return null;
	}
}

export async function getPaymentByOrderIdDB({
	buyerOrderId,
	session,
}: {
	buyerOrderId: string;
	session?: ClientSession;
}): Promise<IPayment | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(buyerOrderId)) return null;
		return (
			(
				await Payment.aggregate<IPayment>(
					[
						{
							$match: {
								buyerOrderId: new mongoose.Types.ObjectId(
									buyerOrderId,
								),
							},
						},
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

/**
 * Atomically claim a payment for webhook processing. Only the FIRST webhook
 * for a ref succeeds (`webhookVerified:false` guard) — concurrent/duplicate
 * deliveries get `null`. Returns the updated payment on success.
 */
export async function claimPaymentWebhookDB({
	paystackRef,
	channel,
	session,
}: {
	paystackRef: string;
	channel?: string;
	session?: ClientSession;
}): Promise<IPayment | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		const res = await Payment.findOneAndUpdate(
			{ paystackRef, webhookVerified: false },
			{
				$set: {
					status: PaymentStatus.SUCCESS,
					webhookVerified: true,
					paidAt: new Date(),
					channel,
				},
			},
			{ session, returnDocument: "after" },
		);
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "claimPaymentWebhookDB",
			success: "true",
		});
		return res ? (res.toObject() as unknown as IPayment) : null;
	} catch {
		timer({
			operation: IOperationType.Update,
			collection: collectionName,
			method: "claimPaymentWebhookDB",
			success: "false",
		});
		return null;
	}
}

export async function markPaymentRefundedDB({
	buyerOrderId,
	session,
}: {
	buyerOrderId: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await Payment.findOneAndUpdate(
			{ buyerOrderId: new mongoose.Types.ObjectId(buyerOrderId) },
			{ $set: { status: PaymentStatus.REFUNDED } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function markPaymentAbandonedDB({
	buyerOrderId,
	session,
}: {
	buyerOrderId: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		const res = await Payment.findOneAndUpdate(
			{
				buyerOrderId: new mongoose.Types.ObjectId(buyerOrderId),
				webhookVerified: false,
			},
			{ $set: { status: PaymentStatus.ABANDONED } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export * from "./types";
