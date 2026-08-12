import mongoose, { type ClientSession, type Model } from "mongoose";
import {
	assertPayoutV2FoundationEnabled,
	PAYOUT_V2_GRACE_PERIOD_MS,
} from "../../constants";
import { PaymentSettlementMode } from "../enums";
import { Payment } from "../payments";
import {
	type IVendorPayable,
	type IVendorPayableCreateInput,
	PAYOUT_HOLD_REASON_CODES,
	VENDOR_PAYABLE_STATUSES,
} from "./types";

const collectionName = "vendorPayables";
export type VendorPayableModel = Model<any>;

const eligibilityEvidenceSchema = new mongoose.Schema(
	{
		confirmationMethod: {
			type: String,
			enum: ["QR", "PIN", "SUPPORT"],
			required: true,
		},
		confirmationReference: { type: String },
		confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
		paymentVerifiedAt: { type: Date, required: true },
		evaluatedAt: { type: Date, required: true },
		evaluatorVersion: { type: String, required: true },
	},
	{ _id: false },
);

const schema = new mongoose.Schema<any>(
	{
		buyerOrderId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "buyerOrders",
			required: true,
			unique: true,
		},
		paymentId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "payments",
			required: true,
			unique: true,
		},
		vendorId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorProfiles",
			required: true,
			index: true,
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
		status: {
			type: String,
			enum: VENDOR_PAYABLE_STATUSES,
			default: "GRACE_PERIOD",
			index: true,
		},
		payoutId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "payouts",
			index: true,
		},
		hold: {
			active: { type: Boolean, default: false },
			reasonCode: { type: String, enum: PAYOUT_HOLD_REASON_CODES },
			note: { type: String },
			heldAt: { type: Date },
			heldBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
			releasedAt: { type: Date },
			releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
		},
		trustedCompletionAt: { type: Date, required: true, immutable: true },
		payoutEligibleAt: { type: Date, required: true, immutable: true },
		eligibilityEvidence: {
			type: eligibilityEvidenceSchema,
			required: true,
			immutable: true,
		},
		linkedDisputeIds: {
			type: [
				{ type: mongoose.Schema.Types.ObjectId, ref: "orderDisputes" },
			],
			default: [],
		},
		linkedRefundId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "refunds",
		},
		idempotencyKey: {
			type: String,
			required: true,
			unique: true,
			immutable: true,
		},
		eligibleAt: { type: Date, required: true, default: Date.now },
		queuedAt: { type: Date },
		processingAt: { type: Date },
		paidAt: { type: Date },
		cancelledAt: { type: Date },
		debtRecordedAt: { type: Date },
	},
	{ timestamps: true },
);

schema.index({ vendorId: 1, status: 1, payoutEligibleAt: 1 });
schema.index({ "hold.active": 1, status: 1 });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const VendorPayable: VendorPayableModel =
	(mongoose.models[collectionName] as VendorPayableModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export type ICreateVendorPayableResult = IVendorPayable & { created: boolean };

/**
 * Set-on-insert only: retries return the original immutable payable and cannot
 * alter its amount or evidence. Unique order/payment keys close alternate-race
 * paths that use a different idempotency key.
 */
export async function createVendorPayableOnceDB({
	payload,
	session,
}: {
	payload: IVendorPayableCreateInput;
	session?: ClientSession;
}): Promise<ICreateVendorPayableResult | null> {
	assertPayoutV2FoundationEnabled();
	try {
		if (
			payload.settlementMode !==
			PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2
		) {
			return null;
		}
		if (
			!mongoose.Types.ObjectId.isValid(payload.paymentId) ||
			!mongoose.Types.ObjectId.isValid(payload.buyerOrderId) ||
			!mongoose.Types.ObjectId.isValid(payload.vendorId) ||
			payload.payoutEligibleAt.getTime() !==
				payload.trustedCompletionAt.getTime() +
					PAYOUT_V2_GRACE_PERIOD_MS ||
			!Number.isFinite(payload.payoutEligibleAt.getTime())
		) {
			return null;
		}
		// Hard isolation boundary: a caller-supplied enum is insufficient. The
		// underlying payment itself must be explicitly V2 and verified.
		const paymentExists = await Payment.exists({
			_id: new mongoose.Types.ObjectId(payload.paymentId),
			buyerOrderId: new mongoose.Types.ObjectId(payload.buyerOrderId),
			vendorId: new mongoose.Types.ObjectId(payload.vendorId),
			settlementMode: PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
			status: "SUCCESS",
			webhookVerified: true,
			paidAt: { $exists: true },
			vendorAmountKobo: payload.amountKobo,
		});
		if (!paymentExists) return null;
		const result = await VendorPayable.findOneAndUpdate(
			{ paymentId: new mongoose.Types.ObjectId(payload.paymentId) },
			{
				$setOnInsert: {
					buyerOrderId: new mongoose.Types.ObjectId(
						payload.buyerOrderId,
					),
					vendorId: new mongoose.Types.ObjectId(payload.vendorId),
					settlementMode: payload.settlementMode,
					amountKobo: payload.amountKobo,
					trustedCompletionAt: payload.trustedCompletionAt,
					payoutEligibleAt: payload.payoutEligibleAt,
					eligibilityEvidence: payload.eligibilityEvidence,
					linkedDisputeIds: (payload.linkedDisputeIds ?? []).map(
						(id) => new mongoose.Types.ObjectId(id),
					),
					...(payload.linkedRefundId
						? {
								linkedRefundId: new mongoose.Types.ObjectId(
									payload.linkedRefundId,
								),
							}
						: {}),
					idempotencyKey: payload.idempotencyKey,
					status: payload.initialStatus ?? "GRACE_PERIOD",
					hold: payload.initialHold ?? { active: false },
					...(payload.initialStatus === "ELIGIBLE"
						? { eligibleAt: new Date() }
						: {}),
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
		const payable = (typeof doc.toObject === "function"
			? doc.toObject()
			: doc) as unknown as IVendorPayable;
		return {
			...payable,
			created: result.lastErrorObject?.updatedExisting !== true,
		};
	} catch {
		return null;
	}
}

export async function getVendorPayableByOrderIdDB({
	buyerOrderId,
}: {
	buyerOrderId: string;
}): Promise<IVendorPayable | null> {
	if (!mongoose.Types.ObjectId.isValid(buyerOrderId)) return null;
	const doc = await VendorPayable.findOne({
		buyerOrderId: new mongoose.Types.ObjectId(buyerOrderId),
	});
	return doc?.toObject() as unknown as IVendorPayable | null;
}

export async function setVendorPayableHoldDB(input: {
	buyerOrderId: string;
	reasonCode: string;
	note?: string;
	heldBy?: string;
	linkedDisputeId?: string;
	linkedRefundId?: string;
}): Promise<IVendorPayable | null> {
	const now = new Date();
	const set: Record<string, unknown> = {
		status: "HELD",
		"hold.active": true,
		"hold.reasonCode": input.reasonCode,
		"hold.note": input.note,
		"hold.heldAt": now,
	};
	if (input.heldBy)
		set["hold.heldBy"] = new mongoose.Types.ObjectId(input.heldBy);
	if (input.linkedRefundId)
		set.linkedRefundId = new mongoose.Types.ObjectId(input.linkedRefundId);
	const update: Record<string, unknown> = { $set: set };
	if (input.linkedDisputeId)
		update.$addToSet = {
			linkedDisputeIds: new mongoose.Types.ObjectId(
				input.linkedDisputeId,
			),
		};
	const doc = await VendorPayable.findOneAndUpdate(
		{
			buyerOrderId: new mongoose.Types.ObjectId(input.buyerOrderId),
			status: { $nin: ["PAID", "CANCELLED", "VENDOR_DEBT"] },
		},
		update,
		{ returnDocument: "after" },
	);
	return doc?.toObject() as unknown as IVendorPayable | null;
}

export async function releaseVendorPayableHoldDB(input: {
	buyerOrderId: string;
	releasedBy: string;
	note?: string;
}): Promise<IVendorPayable | null> {
	const doc = await VendorPayable.findOneAndUpdate(
		{
			buyerOrderId: new mongoose.Types.ObjectId(input.buyerOrderId),
			status: "HELD",
		},
		{
			$set: {
				"hold.active": false,
				"hold.releasedAt": new Date(),
				"hold.releasedBy": new mongoose.Types.ObjectId(
					input.releasedBy,
				),
				"hold.note": input.note,
			},
		},
		{ returnDocument: "after" },
	);
	return doc?.toObject() as unknown as IVendorPayable | null;
}

export async function updateVendorPayableEvaluationDB(input: {
	id: string;
	status: "GRACE_PERIOD" | "ELIGIBLE" | "HELD";
	hold?: IVendorPayableCreateInput["initialHold"];
}): Promise<IVendorPayable | null> {
	const set: Record<string, unknown> = {
		status: input.status,
		...(input.hold ? { hold: input.hold } : {}),
	};
	if (input.status === "ELIGIBLE") set.eligibleAt = new Date();
	const doc = await VendorPayable.findOneAndUpdate(
		{
			_id: new mongoose.Types.ObjectId(input.id),
			status: {
				$nin: [
					"QUEUED",
					"PROCESSING",
					"PAID",
					"CANCELLED",
					"VENDOR_DEBT",
				],
			},
		},
		{ $set: set },
		{ returnDocument: "after" },
	);
	return doc?.toObject() as unknown as IVendorPayable | null;
}

export async function listDueEligibleVendorPayablesDB(input: {
	now: Date;
	limit: number;
}): Promise<IVendorPayable[]> {
	return VendorPayable.find({
		settlementMode: PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
		status: "ELIGIBLE",
		"hold.active": { $ne: true },
		payoutEligibleAt: { $lte: input.now },
	})
		.sort({ vendorId: 1, payoutEligibleAt: 1 })
		.limit(Math.min(input.limit, 1000))
		.lean();
}

export async function listDueGraceVendorPayableOrderIdsDB(input: {
	now: Date;
	limit: number;
}): Promise<string[]> {
	const rows = await VendorPayable.find({
		status: "GRACE_PERIOD",
		payoutEligibleAt: { $lte: input.now },
	})
		.select({ buyerOrderId: 1 })
		.limit(Math.min(input.limit, 1000))
		.lean();
	return rows.map((row) => String(row.buyerOrderId));
}

export async function listVendorPayablesDB(
	input: { limit?: number; vendorId?: string; status?: string } = {},
): Promise<IVendorPayable[]> {
	const filter: Record<string, unknown> = {};
	if (input.vendorId && mongoose.Types.ObjectId.isValid(input.vendorId))
		filter.vendorId = new mongoose.Types.ObjectId(input.vendorId);
	if (input.status) filter.status = input.status;
	return VendorPayable.find(filter)
		.sort({ createdAt: -1 })
		.limit(Math.min(input.limit ?? 100, 200))
		.lean();
}

export async function claimVendorPayableForPayoutDB(input: {
	id: string;
	payoutId: string;
}): Promise<IVendorPayable | null> {
	const doc = await VendorPayable.findOneAndUpdate(
		{
			_id: new mongoose.Types.ObjectId(input.id),
			status: "ELIGIBLE",
			"hold.active": { $ne: true },
			payoutEligibleAt: { $lte: new Date() },
		},
		{
			$set: {
				status: "QUEUED",
				queuedAt: new Date(),
				payoutId: new mongoose.Types.ObjectId(input.payoutId),
			},
		},
		{ returnDocument: "after" },
	);
	return doc?.toObject() as unknown as IVendorPayable | null;
}

export async function markPayoutPayablesDB(input: {
	payoutId: string;
	status: "PROCESSING" | "PAID" | "ELIGIBLE";
}): Promise<void> {
	const now = new Date();
	const timestamps =
		input.status === "PROCESSING"
			? { processingAt: now }
			: input.status === "PAID"
				? { paidAt: now }
				: { queuedAt: null, processingAt: null };
	await VendorPayable.updateMany(
		{
			payoutId: new mongoose.Types.ObjectId(input.payoutId),
			status: { $ne: "PAID" },
		},
		{ $set: { status: input.status, ...timestamps } },
	);
}

export * from "./types";
