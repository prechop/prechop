import mongoose, { type Model } from "mongoose";
import { assertPayoutV2FoundationEnabled } from "../../constants";
import type { IVendorAdjustment } from "./types";

const collectionName = "vendorAdjustments";
type VendorAdjustmentModel = Model<any>;
const schema = new mongoose.Schema<any>(
	{
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
			immutable: true,
		},
		buyerOrderId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "buyerOrders",
			required: true,
			immutable: true,
		},
		paymentId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "payments",
			required: true,
			immutable: true,
		},
		refundId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "refunds",
			required: true,
			unique: true,
			immutable: true,
		},
		amountKobo: { type: Number, min: 1, required: true, immutable: true },
		type: {
			type: String,
			enum: ["POST_PAYOUT_REFUND_DEBT"],
			required: true,
			immutable: true,
		},
		status: {
			type: String,
			enum: ["OPEN", "APPLIED", "WAIVED"],
			default: "OPEN",
			index: true,
		},
		reason: { type: String, required: true, immutable: true },
		idempotencyKey: {
			type: String,
			required: true,
			unique: true,
			immutable: true,
		},
	},
	{ timestamps: true },
);
schema.index({ vendorId: 1, status: 1, createdAt: 1 });
export const VendorAdjustment: VendorAdjustmentModel =
	(mongoose.models[collectionName] as VendorAdjustmentModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export async function createPostPayoutRefundAdjustmentOnceDB(input: {
	vendorId: string;
	buyerOrderId: string;
	paymentId: string;
	refundId: string;
	amountKobo: number;
	reason: string;
}): Promise<IVendorAdjustment | null> {
	assertPayoutV2FoundationEnabled();
	const doc = await VendorAdjustment.findOneAndUpdate(
		{ refundId: new mongoose.Types.ObjectId(input.refundId) },
		{
			$setOnInsert: {
				...input,
				vendorId: new mongoose.Types.ObjectId(input.vendorId),
				buyerOrderId: new mongoose.Types.ObjectId(input.buyerOrderId),
				paymentId: new mongoose.Types.ObjectId(input.paymentId),
				refundId: new mongoose.Types.ObjectId(input.refundId),
				type: "POST_PAYOUT_REFUND_DEBT",
				status: "OPEN",
				idempotencyKey: `post-payout-refund:${input.refundId}`,
			},
		},
		{ upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
	);
	return doc?.toObject() as unknown as IVendorAdjustment | null;
}

export * from "./types";
