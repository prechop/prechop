import mongoose, { type ClientSession, type Model } from "mongoose";
import { assertPayoutV2FoundationEnabled } from "../../constants";
import { PaymentSettlementMode } from "../enums";
import {
	type IPayout,
	type IPayoutCreateInput,
	PAYOUT_STATUSES,
} from "./types";

const collectionName = "payouts";
export type PayoutModel = Model<any>;

const recipientSnapshotSchema = new mongoose.Schema(
	{
		recipientId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "vendorTransferRecipients",
			required: true,
		},
		recipientVersion: { type: Number, required: true },
		paystackRecipientCode: { type: String, required: true },
		bankCode: { type: String, required: true },
		bankName: { type: String, required: true },
		accountName: { type: String, required: true },
		accountNumberLast4: { type: String, required: true, match: /^\d{4}$/ },
		verifiedAt: { type: Date, required: true },
	},
	{ _id: false },
);

const schema = new mongoose.Schema<any>(
	{
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
		currency: {
			type: String,
			enum: ["NGN"],
			required: true,
			immutable: true,
		},
		totalAmountKobo: {
			type: Number,
			required: true,
			min: 1,
			validate: Number.isSafeInteger,
			immutable: true,
		},
		transferFeeKobo: {
			type: Number,
			required: true,
			min: 0,
			validate: Number.isSafeInteger,
			immutable: true,
		},
		stampDutyKobo: {
			type: Number,
			required: true,
			min: 0,
			validate: Number.isSafeInteger,
			immutable: true,
		},
		grossDebitKobo: {
			type: Number,
			required: true,
			min: 1,
			validate: Number.isSafeInteger,
			immutable: true,
		},
		status: {
			type: String,
			enum: PAYOUT_STATUSES,
			default: "DRAFT",
			index: true,
		},
		recipientSnapshot: {
			type: recipientSnapshotSchema,
			required: true,
			immutable: true,
		},
		idempotencyKey: {
			type: String,
			required: true,
			unique: true,
			immutable: true,
		},
		paystackTransferReference: { type: String },
		paystackTransferCode: { type: String },
		queuedAt: { type: Date },
		submittedAt: { type: Date },
		paidAt: { type: Date },
		failedAt: { type: Date },
		cancelledAt: { type: Date },
		failureReason: { type: String },
		transferAttempts: {
			type: [
				{
					at: Date,
					reference: String,
					code: String,
					providerStatus: String,
				},
			],
			default: [],
		},
	},
	{ timestamps: true },
);

schema.index({ vendorId: 1, status: 1, createdAt: 1 });
schema.index(
	{ paystackTransferReference: 1 },
	{
		unique: true,
		partialFilterExpression: {
			paystackTransferReference: { $exists: true },
		},
	},
);
schema.index(
	{ paystackTransferCode: 1 },
	{
		unique: true,
		partialFilterExpression: { paystackTransferCode: { $exists: true } },
	},
);

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const Payout: PayoutModel =
	(mongoose.models[collectionName] as PayoutModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

export type ICreatePayoutResult = IPayout & { created: boolean };

export async function getPayoutByTransferIdentityDB(input: {
	reference?: string;
	code?: string;
}): Promise<IPayout | null> {
	const or: Record<string, string>[] = [];
	if (input.reference)
		or.push({ paystackTransferReference: input.reference });
	if (input.code) or.push({ paystackTransferCode: input.code });
	if (!or.length) return null;
	if (input.reference)
		or.push({ "transferAttempts.reference": input.reference });
	if (input.code) or.push({ "transferAttempts.code": input.code });
	const doc = await Payout.findOne({ $or: or });
	return doc?.toObject() as unknown as IPayout | null;
}

export async function listPayoutsForReconciliationDB(input: {
	limit: number;
}): Promise<IPayout[]> {
	return Payout.find({
		status: { $in: ["QUEUED", "PROCESSING"] },
		paystackTransferReference: { $exists: true },
	})
		.sort({ updatedAt: 1 })
		.limit(Math.min(input.limit, 200))
		.lean();
}

export async function listPayoutsDB(
	input: { limit?: number; vendorId?: string; status?: string } = {},
): Promise<IPayout[]> {
	const filter: Record<string, unknown> = {};
	if (input.vendorId && mongoose.Types.ObjectId.isValid(input.vendorId))
		filter.vendorId = new mongoose.Types.ObjectId(input.vendorId);
	if (input.status) filter.status = input.status;
	return Payout.find(filter)
		.sort({ createdAt: -1 })
		.limit(Math.min(input.limit ?? 100, 200))
		.lean();
}

export async function markPayoutSubmittedDB(input: {
	id: string;
	reference: string;
	code?: string;
	providerStatus?: string;
}): Promise<IPayout | null> {
	const doc = await Payout.findOneAndUpdate(
		{
			_id: new mongoose.Types.ObjectId(input.id),
			status: { $in: ["DRAFT", "QUEUED", "FAILED"] },
		},
		{
			$set: {
				status: "PROCESSING",
				paystackTransferReference: input.reference,
				...(input.code ? { paystackTransferCode: input.code } : {}),
				submittedAt: new Date(),
				providerStatus: input.providerStatus,
			},
			$push: {
				transferAttempts: {
					at: new Date(),
					reference: input.reference,
					...(input.code ? { code: input.code } : {}),
					providerStatus: input.providerStatus,
				},
			},
		},
		{ returnDocument: "after" },
	);
	return doc?.toObject() as unknown as IPayout | null;
}

export async function markPayoutQueuedDB(input: {
	id: string;
	reference: string;
}): Promise<IPayout | null> {
	const doc = await Payout.findOneAndUpdate(
		{
			_id: new mongoose.Types.ObjectId(input.id),
			status: { $in: ["DRAFT", "FAILED"] },
		},
		{
			$set: {
				status: "QUEUED",
				queuedAt: new Date(),
				paystackTransferReference: input.reference,
			},
		},
		{ returnDocument: "after" },
	);
	return doc?.toObject() as unknown as IPayout | null;
}

export async function markPayoutFinalStateDB(input: {
	id: string;
	status: "PAID" | "FAILED" | "REVERSED";
	reason?: string;
}): Promise<IPayout | null> {
	const now = new Date();
	const doc = await Payout.findOneAndUpdate(
		{
			_id: new mongoose.Types.ObjectId(input.id),
			status: { $ne: input.status },
		},
		{
			$set: {
				status: input.status,
				...(input.status === "PAID"
					? { paidAt: now }
					: { failedAt: now }),
				failureReason: input.reason,
			},
		},
		{ returnDocument: "after" },
	);
	return doc?.toObject() as unknown as IPayout | null;
}

/** Creates only a local DRAFT batch. It performs no external transfer. */
export async function createPayoutDraftOnceDB({
	payload,
	session,
}: {
	payload: IPayoutCreateInput;
	session?: ClientSession;
}): Promise<ICreatePayoutResult | null> {
	assertPayoutV2FoundationEnabled();
	try {
		if (
			payload.settlementMode !==
			PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2
		) {
			return null;
		}
		const result = await Payout.findOneAndUpdate(
			{ idempotencyKey: payload.idempotencyKey },
			{
				$setOnInsert: {
					...payload,
					vendorId: new mongoose.Types.ObjectId(payload.vendorId),
					recipientSnapshot: {
						...payload.recipientSnapshot,
						recipientId: new mongoose.Types.ObjectId(
							payload.recipientSnapshot.recipientId,
						),
					},
					grossDebitKobo:
						payload.totalAmountKobo +
						payload.transferFeeKobo +
						payload.stampDutyKobo,
					status: "DRAFT",
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
		const payout = (typeof doc.toObject === "function"
			? doc.toObject()
			: doc) as unknown as IPayout;
		return {
			...payout,
			created: result.lastErrorObject?.updatedExisting !== true,
		};
	} catch {
		return null;
	}
}

export * from "./types";
