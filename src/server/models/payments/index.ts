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
		paystackAuthorizationUrl: { type: String },
		externalPaymentTokenHash: {
			type: String,
			unique: true,
			sparse: true,
			index: true,
		},
		externalPaymentExpiresAt: { type: Date, index: true },
		amountKobo: { type: Number, required: true },
		platformFeeKobo: { type: Number, required: true },
		foodSubtotalKobo: { type: Number, default: 0 },
		deliveryFeeKobo: { type: Number, default: 0 },
		paymentProcessingFeeKobo: { type: Number, default: 0 },
		prechopCommissionKobo: { type: Number, default: 0 },
		vendorAmountKobo: { type: Number, required: true },
		vendorSettlementKobo: { type: Number, default: 0 },
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

/** Admin payments listing, newest first, with optional status filter. */
export async function listPaymentsDB({
	status,
	campusId,
	skip = 0,
	limit = 50,
	session,
}: {
	status?: string;
	campusId?: string;
	skip?: number;
	limit?: number;
	session?: ClientSession;
} = {}): Promise<{ payments: IPayment[]; total: number }> {
	const match: Record<string, unknown> = {};
	if (status) match.status = status;
	if (campusId && mongoose.Types.ObjectId.isValid(campusId))
		match.campusId = new mongoose.Types.ObjectId(campusId);
	const [payments, total] = await Promise.all([
		Payment.aggregate<IPayment>(
			[
				{ $match: match },
				{ $sort: { createdAt: -1 } },
				{ $skip: skip },
				{ $limit: Math.min(limit, 100) },
			],
			{ session },
		),
		Payment.countDocuments(match, { session }),
	]);
	return { payments, total };
}

export async function aggregatePaymentRevenueDB(): Promise<{
	grossRevenueKobo: number;
	platformFeeKobo: number;
	serviceFeeKobo: number;
	vendorPayoutKobo: number;
	refundedRevenueKobo: number;
	successfulPayments: number;
	refundedPayments: number;
}> {
	try {
		const rows = await Payment.aggregate<{
			_id: string;
			grossRevenueKobo: number;
			platformFeeKobo: number;
			serviceFeeKobo: number;
			vendorPayoutKobo: number;
			count: number;
		}>([
			{
				$match: {
					status: {
						$in: [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED],
					},
				},
			},
			{
				$group: {
					_id: "$status",
					grossRevenueKobo: { $sum: "$amountKobo" },
					platformFeeKobo: { $sum: "$platformFeeKobo" },
					serviceFeeKobo: { $sum: "$paymentProcessingFeeKobo" },
					vendorPayoutKobo: { $sum: "$vendorAmountKobo" },
					count: { $sum: 1 },
				},
			},
		]);
		const success = rows.find((r) => r._id === PaymentStatus.SUCCESS);
		const refunded = rows.find((r) => r._id === PaymentStatus.REFUNDED);
		return {
			grossRevenueKobo: success?.grossRevenueKobo ?? 0,
			platformFeeKobo: success?.platformFeeKobo ?? 0,
			serviceFeeKobo: success?.serviceFeeKobo ?? 0,
			vendorPayoutKobo: success?.vendorPayoutKobo ?? 0,
			refundedRevenueKobo: refunded?.grossRevenueKobo ?? 0,
			successfulPayments: success?.count ?? 0,
			refundedPayments: refunded?.count ?? 0,
		};
	} catch {
		return {
			grossRevenueKobo: 0,
			platformFeeKobo: 0,
			serviceFeeKobo: 0,
			vendorPayoutKobo: 0,
			refundedRevenueKobo: 0,
			successfulPayments: 0,
			refundedPayments: 0,
		};
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

export async function getPaymentByExternalTokenHashDB({
	tokenHash,
	session,
}: {
	tokenHash: string;
	session?: ClientSession;
}): Promise<IPayment | null> {
	try {
		return (
			(
				await Payment.aggregate<IPayment>(
					[{ $match: { externalPaymentTokenHash: tokenHash } }, { $limit: 1 }],
					{ session },
				)
			).at(0) ?? null
		);
	} catch {
		return null;
	}
}

export async function markPaymentExternalInitializedDB({
	paystackRef,
	paystackAccessCode,
	paystackAuthorizationUrl,
	session,
}: {
	paystackRef: string;
	paystackAccessCode: string;
	paystackAuthorizationUrl: string;
	session?: ClientSession;
}): Promise<IPayment | null> {
	try {
		const res = await Payment.findOneAndUpdate(
			{
				paystackRef,
				webhookVerified: false,
				status: PaymentStatus.AWAITING_EXTERNAL_PAYMENT,
			},
			{
				$set: {
					status: PaymentStatus.INITIALIZED,
					paystackAccessCode,
					paystackAuthorizationUrl,
				},
			},
			{ session, returnDocument: "after" },
		);
		return res ? (res.toObject() as unknown as IPayment) : null;
	} catch {
		return null;
	}
}

export async function markPaymentBuyerInitializedDB({
	buyerOrderId,
	paystackAccessCode,
	paystackAuthorizationUrl,
	session,
}: {
	buyerOrderId: string;
	paystackAccessCode: string;
	paystackAuthorizationUrl: string;
	session?: ClientSession;
}): Promise<IPayment | null> {
	try {
		const res = await Payment.findOneAndUpdate(
			{
				buyerOrderId: new mongoose.Types.ObjectId(buyerOrderId),
				webhookVerified: false,
				status: PaymentStatus.AWAITING_EXTERNAL_PAYMENT,
				paystackAuthorizationUrl: { $exists: false },
			},
			{
				$set: {
					status: PaymentStatus.INITIALIZED,
					paystackAccessCode,
					paystackAuthorizationUrl,
				},
				$unset: {
					externalPaymentTokenHash: "",
					externalPaymentExpiresAt: "",
				},
			},
			{ session, returnDocument: "after" },
		);
		return res ? (res.toObject() as unknown as IPayment) : null;
	} catch {
		return null;
	}
}

export async function markPaymentExpiredDB({
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
				status: {
					$in: [
						PaymentStatus.AWAITING_EXTERNAL_PAYMENT,
						PaymentStatus.INITIALIZED,
					],
				},
			},
			{ $set: { status: PaymentStatus.EXPIRED } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function markPaymentCancelledDB({
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
			{ $set: { status: PaymentStatus.CANCELLED } },
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
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
