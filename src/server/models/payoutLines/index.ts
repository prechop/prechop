import mongoose, { type ClientSession, type Model } from "mongoose";
import { assertPayoutV2FoundationEnabled } from "../../constants";
import { PaymentSettlementMode } from "../enums";
import { Payment } from "../payments";
import { VendorPayable } from "../vendorPayables";
import type { IPayoutLine, IPayoutLineCreateInput } from "./types";

const collectionName = "payoutLines";
export type PayoutLineModel = Model<any>;

const schema = new mongoose.Schema<any>(
	{
		payoutId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "payouts",
			required: true,
			index: true,
			immutable: true,
		},
		vendorPayableId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorPayables",
			required: true,
			unique: true,
			immutable: true,
		},
		buyerOrderId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "buyerOrders",
			required: true,
			unique: true,
			immutable: true,
		},
		paymentId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "payments",
			required: true,
			unique: true,
			immutable: true,
		},
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
			immutable: true,
		},
		settlementMode: {
			type: String,
			enum: [PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2],
			required: true,
			immutable: true,
		},
		amountKobo: {
			type: Number,
			required: true,
			min: 1,
			validate: Number.isSafeInteger,
			immutable: true,
		},
		idempotencyKey: {
			type: String,
			required: true,
			unique: true,
			immutable: true,
		},
	},
	{ timestamps: true },
);

schema.index({ payoutId: 1, vendorId: 1 });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const PayoutLine: PayoutLineModel =
	(mongoose.models[collectionName] as PayoutLineModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export type ICreatePayoutLineResult = IPayoutLine & { created: boolean };

export async function listPayoutLinesDB({
	payoutId,
}: {
	payoutId: string;
}): Promise<IPayoutLine[]> {
	return PayoutLine.find({
		payoutId: new mongoose.Types.ObjectId(payoutId),
	}).lean();
}

/**
 * Immutable allocation. Unique payable/order/payment indexes independently
 * prevent a second payout even when a retry uses a different batch or key.
 */
export async function createPayoutLineOnceDB({
	payload,
	session,
}: {
	payload: IPayoutLineCreateInput;
	session?: ClientSession;
}): Promise<ICreatePayoutLineResult | null> {
	assertPayoutV2FoundationEnabled();
	try {
		if (
			payload.settlementMode !==
			PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2
		) {
			return null;
		}
		if (
			!mongoose.Types.ObjectId.isValid(payload.vendorPayableId) ||
			!mongoose.Types.ObjectId.isValid(payload.paymentId) ||
			!mongoose.Types.ObjectId.isValid(payload.buyerOrderId) ||
			!mongoose.Types.ObjectId.isValid(payload.vendorId)
		) {
			return null;
		}
		const [payableExists, paymentExists] = await Promise.all([
			VendorPayable.exists({
				_id: new mongoose.Types.ObjectId(payload.vendorPayableId),
				paymentId: new mongoose.Types.ObjectId(payload.paymentId),
				buyerOrderId: new mongoose.Types.ObjectId(payload.buyerOrderId),
				vendorId: new mongoose.Types.ObjectId(payload.vendorId),
				settlementMode:
					PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
				amountKobo: payload.amountKobo,
				status: "QUEUED",
				"hold.active": { $ne: true },
			}),
			Payment.exists({
				_id: new mongoose.Types.ObjectId(payload.paymentId),
				settlementMode:
					PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
			}),
		]);
		if (!payableExists || !paymentExists) return null;
		const result = await PayoutLine.findOneAndUpdate(
			{
				vendorPayableId: new mongoose.Types.ObjectId(
					payload.vendorPayableId,
				),
			},
			{
				$setOnInsert: {
					payoutId: new mongoose.Types.ObjectId(payload.payoutId),
					buyerOrderId: new mongoose.Types.ObjectId(
						payload.buyerOrderId,
					),
					paymentId: new mongoose.Types.ObjectId(payload.paymentId),
					vendorId: new mongoose.Types.ObjectId(payload.vendorId),
					settlementMode: payload.settlementMode,
					amountKobo: payload.amountKobo,
					idempotencyKey: payload.idempotencyKey,
				},
			},
			{
				session,
				upsert: true,
				returnDocument: "after",
				setDefaultsOnInsert: true,
				includeResultMetadata: true,
				runValidators: true,
			},
		);
		const doc = result?.value;
		if (!doc) return null;
		const line = (typeof doc.toObject === "function"
			? doc.toObject()
			: doc) as unknown as IPayoutLine;
		return {
			...line,
			created: result.lastErrorObject?.updatedExisting !== true,
		};
	} catch {
		return null;
	}
}

export * from "./types";
