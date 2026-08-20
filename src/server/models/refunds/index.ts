import mongoose, { type ClientSession, type Model } from "mongoose";
import { ErrResourceNotFound } from "../../constants";
import { databaseResponseTimeHistogram } from "../../metrics";
import { IOperationType } from "../utils";
import type { IRefund, IRefundCreateInput } from "./types";

const collectionName = "refunds";

export type RefundModel = Model<any>;

const ACCOUNT_CLOSURE_BLOCKING_REFUND_STATUSES = [
	"REFUND_PENDING",
	"REFUND_PROCESSING",
	"REFUND_NEEDS_ATTENTION",
	"REFUND_FAILED",
];

const schema = new mongoose.Schema<any>(
	{
		paymentId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "payments",
			required: true,
			unique: true,
		},
		// Integer kobo. min:0 so a negative "refund" — which would be a silent
		// credit against the payment — cannot be stored at all.
		amountKobo: { type: Number, required: true, min: 0 },
		reason: { type: String, required: true },
		status: {
			type: String,
			enum: [
				"REFUND_PENDING",
				"REFUND_PROCESSING",
				"REFUND_NEEDS_ATTENTION",
				"REFUNDED",
				"REFUND_FAILED",
			],
			default: "REFUND_PENDING",
			index: true,
		},
		paystackRefundId: {
			type: String,
			required: false,
			// Collapse null to undefined so the path is left *unset* rather
			// than stored as null. The unique partial index below keys on
			// $exists, under which two explicit nulls would collide with each
			// other — this makes that unrepresentable through the model.
			set: (v: unknown) => (v === null ? undefined : v),
		},
		processedAt: { type: Date, required: false },
		failedAt: { type: Date, required: false },
		failureReason: { type: String, required: false },
		paystackStatus: { type: String, required: false },
		expectedAt: { type: Date, required: false },
		submittedAt: { type: Date, required: false },
		needsAttentionAt: { type: Date, required: false },
		lastReconciledAt: { type: Date, required: false },
		submissionAttempts: { type: Number, default: 0, min: 0 },
		attempts: {
			type: [
				{
					at: { type: Date, required: true },
					kind: {
						type: String,
						enum: ["INITIAL", "RETRY"],
						required: true,
					},
					outcome: {
						type: String,
						enum: ["ACCEPTED", "FAILED", "DISCOVERED"],
						required: true,
					},
					paystackRefundId: { type: String },
					paystackStatus: { type: String },
					error: { type: String },
				},
			],
			default: [],
		},
	},
	{ timestamps: true },
);

export async function countBlockingRefundsDB({
	buyerId,
	vendorId,
	session,
}: {
	buyerId?: string;
	vendorId?: string;
	session?: ClientSession;
}): Promise<number> {
	try {
		const ownership: Record<string, unknown>[] = [];
		if (buyerId && mongoose.Types.ObjectId.isValid(buyerId)) {
			ownership.push({
				"_payment.buyerId": new mongoose.Types.ObjectId(buyerId),
			});
		}
		if (vendorId && mongoose.Types.ObjectId.isValid(vendorId)) {
			ownership.push({
				"_payment.vendorId": new mongoose.Types.ObjectId(vendorId),
			});
		}
		if (ownership.length === 0) return 0;
		const rows = await Refund.aggregate<{ count: number }>(
			[
				{
					$match: {
						status: {
							$in: ACCOUNT_CLOSURE_BLOCKING_REFUND_STATUSES,
						},
					},
				},
				{
					$lookup: {
						from: "payments",
						localField: "paymentId",
						foreignField: "_id",
						as: "_payment",
					},
				},
				{ $unwind: "$_payment" },
				{ $match: { $or: ownership } },
				{ $count: "count" },
			],
			{ session },
		);
		return rows[0]?.count ?? 0;
	} catch (error) {
		throw error;
	}
}

// Reconciliation: look a refund up by the id Paystack sends back on
// refund.processed / refund.failed webhooks. Unique so the same Paystack refund
// can never be recorded twice.
//
// $exists (not $type:"string") is deliberate and measured: with a
// $type partial filter the planner cannot prove an equality predicate implies
// the filter, so `find({paystackRefundId})` degrades to a COLLSCAN of the whole
// collection. $exists keeps the lookup on an IXSCAN. See the setter above for
// why the null case this opens up cannot occur.
schema.index(
	{ paystackRefundId: 1 },
	{
		unique: true,
		partialFilterExpression: { paystackRefundId: { $exists: true } },
	},
);
// Reconciliation sweep: refunds created but never confirmed processed, oldest
// first. processedAt leads because it is the selective equality (null).
schema.index({ processedAt: 1, createdAt: 1 });
schema.index({ status: 1, updatedAt: 1 });

schema.pre("aggregate", function () {
	this.pipeline().push({ $addFields: { id: { $toString: "$_id" } } });
	this.pipeline().push({ $project: { __v: 0 } });
});

export const Refund: RefundModel =
	(mongoose.models[collectionName] as RefundModel | undefined) ??
	mongoose.model<any>(collectionName, schema);

// ── Writes ────────────────────────────────────────────────────────────────

/**
 * Idempotently record a refund for a payment. Returns the refund row plus a
 * transient `created` flag (not a stored field).
 *
 * `created` is the part that matters on a money path: the `paymentId` unique
 * index means one payment can only ever have one refund, and this returns the
 * *existing* row with `created:false` when one is already there. The caller
 * must only call Paystack when `created` is true — otherwise a retried webhook
 * or a double-clicked admin refund pays the buyer twice.
 *
 * Returns `null` only for a genuine write failure (bad id, failed validation,
 * DB down), which is safe to retry. That distinction is why this upserts
 * instead of `save()`: `save()` throws a duplicate-key error on the second
 * call, which is indistinguishable from a transient failure once caught.
 */
export type ICreateRefundResult = IRefund & {
	/** true = this call inserted the row and owns calling Paystack. */
	created: boolean;
};

export async function createRefundDB({
	payload,
	session,
}: {
	payload: IRefundCreateInput;
	session?: ClientSession;
}): Promise<ICreateRefundResult | null> {
	const timer = databaseResponseTimeHistogram.startTimer();
	try {
		if (!mongoose.Types.ObjectId.isValid(payload.paymentId)) {
			throw ErrResourceNotFound;
		}
		// paymentId is supplied by the filter on insert — repeating it in
		// $setOnInsert would be a conflicting path.
		const res = await Refund.findOneAndUpdate(
			{ paymentId: new mongoose.Types.ObjectId(payload.paymentId) },
			{
				$setOnInsert: {
					amountKobo: payload.amountKobo,
					reason: payload.reason,
					status: payload.status ?? "REFUND_PENDING",
					...(payload.paystackRefundId
						? { paystackRefundId: payload.paystackRefundId }
						: {}),
					...(payload.processedAt
						? { processedAt: payload.processedAt }
						: {}),
					...(payload.failedAt ? { failedAt: payload.failedAt } : {}),
					...(payload.failureReason
						? { failureReason: payload.failureReason }
						: {}),
				},
			},
			{
				session,
				upsert: true,
				returnDocument: "after",
				setDefaultsOnInsert: true,
				includeResultMetadata: true,
				// Update-validators are OFF by default, so without these the
				// upsert would silently accept a negative amountKobo or a
				// missing reason that `save()` would have rejected.
				runValidators: true,
				context: "query",
			},
		);
		const doc = res?.value;
		if (!doc) throw ErrResourceNotFound;
		timer({
			operation: IOperationType.Create,
			collection: collectionName,
			method: "createRefundDB",
			success: "true",
		});
		const refund = (typeof doc.toObject === "function"
			? doc.toObject()
			: doc) as unknown as IRefund;
		return {
			...refund,
			id: refund._id.toString(),
			created: res.lastErrorObject?.updatedExisting !== true,
		};
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
		const res = await Refund.findOneAndUpdate(
			{
				_id: new mongoose.Types.ObjectId(id),
				status: { $ne: "REFUNDED" },
			},
			{
				$set: {
					status: "REFUNDED",
					paystackRefundId,
					paystackStatus: "processed",
					processedAt: new Date(),
					lastReconciledAt: new Date(),
				},
				$unset: {
					failedAt: "",
					failureReason: "",
					needsAttentionAt: "",
				},
			},
			{ session, returnDocument: "after" },
		);
		if (res) return true;
		return !!(await Refund.exists({
			_id: new mongoose.Types.ObjectId(id),
			status: "REFUNDED",
		}).session(session ?? null));
	} catch {
		return false;
	}
}

export async function markRefundProcessingDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const res = await Refund.findOneAndUpdate(
			{
				_id: new mongoose.Types.ObjectId(id),
				status: { $ne: "REFUNDED" },
			},
			{
				$set: {
					status: "REFUND_PROCESSING",
					paystackStatus: "processing",
					lastReconciledAt: new Date(),
				},
			},
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function markRefundFailedDB({
	id,
	failureReason,
	paystackStatus,
	lastReconciledAt,
	session,
}: {
	id: string;
	failureReason: string;
	paystackStatus?: string;
	lastReconciledAt?: Date;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const res = await Refund.findOneAndUpdate(
			{
				_id: new mongoose.Types.ObjectId(id),
				status: { $ne: "REFUNDED" },
			},
			{
				$set: {
					status: "REFUND_FAILED",
					failedAt: new Date(),
					failureReason,
					...(paystackStatus ? { paystackStatus } : {}),
					...(lastReconciledAt ? { lastReconciledAt } : {}),
				},
			},
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function markRefundPendingDB({
	id,
	paystackRefundId,
	paystackStatus = "pending",
	expectedAt,
	lastReconciledAt = new Date(),
	session,
}: {
	id: string;
	paystackRefundId?: string;
	paystackStatus?: string;
	expectedAt?: Date;
	lastReconciledAt?: Date;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const res = await Refund.findOneAndUpdate(
			{
				_id: new mongoose.Types.ObjectId(id),
				status: { $nin: ["REFUNDED", "REFUND_PROCESSING"] },
			},
			{
				$set: {
					status: "REFUND_PENDING",
					paystackStatus,
					lastReconciledAt,
					...(paystackRefundId ? { paystackRefundId } : {}),
					...(expectedAt ? { expectedAt } : {}),
				},
				$unset: {
					failedAt: "",
					failureReason: "",
					needsAttentionAt: "",
				},
			},
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function markRefundNeedsAttentionDB({
	id,
	paystackRefundId,
	reason,
	lastReconciledAt = new Date(),
	session,
}: {
	id: string;
	paystackRefundId?: string;
	reason: string;
	lastReconciledAt?: Date;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const now = new Date();
		const res = await Refund.findOneAndUpdate(
			{
				_id: new mongoose.Types.ObjectId(id),
				status: { $ne: "REFUNDED" },
			},
			{
				$set: {
					status: "REFUND_NEEDS_ATTENTION",
					paystackStatus: "needs-attention",
					needsAttentionAt: now,
					failureReason: reason,
					lastReconciledAt,
					...(paystackRefundId ? { paystackRefundId } : {}),
				},
			},
			{ session, returnDocument: "after" },
		);
		return !!res;
	} catch {
		return false;
	}
}

export async function recordRefundSubmissionAttemptDB({
	id,
	kind,
	outcome,
	paystackRefundId,
	paystackStatus,
	error,
	session,
}: {
	id: string;
	kind: "INITIAL" | "RETRY";
	outcome: "ACCEPTED" | "FAILED" | "DISCOVERED";
	paystackRefundId?: string;
	paystackStatus?: string;
	error?: string;
	session?: ClientSession;
}): Promise<boolean> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return false;
		const now = new Date();
		const res = await Refund.findByIdAndUpdate(
			new mongoose.Types.ObjectId(id),
			{
				...(outcome === "DISCOVERED"
					? {}
					: { $inc: { submissionAttempts: 1 } }),
				$set: {
					submittedAt: now,
					...(paystackRefundId ? { paystackRefundId } : {}),
					...(paystackStatus ? { paystackStatus } : {}),
				},
				$push: {
					attempts: {
						at: now,
						kind,
						outcome,
						...(paystackRefundId ? { paystackRefundId } : {}),
						...(paystackStatus ? { paystackStatus } : {}),
						...(error ? { error } : {}),
					},
				},
			},
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

export async function getRefundByIdDB({
	id,
	session,
}: {
	id: string;
	session?: ClientSession;
}): Promise<IRefund | null> {
	try {
		if (!mongoose.Types.ObjectId.isValid(id)) return null;
		const doc = await Refund.findById(
			new mongoose.Types.ObjectId(id),
			null,
			{
				session,
			},
		).lean();
		return doc ? (doc as unknown as IRefund) : null;
	} catch {
		return null;
	}
}

export async function getRefundByPaystackRefundIdDB({
	paystackRefundId,
	session,
}: {
	paystackRefundId: string;
	session?: ClientSession;
}): Promise<IRefund | null> {
	try {
		const doc = await Refund.findOne({ paystackRefundId }, null, {
			session,
		}).lean();
		return doc ? (doc as unknown as IRefund) : null;
	} catch {
		return null;
	}
}

export async function listRefundsForReconciliationDB({
	limit = 100,
	updatedBefore = new Date(Date.now() - 2 * 60 * 1000),
	session,
}: {
	limit?: number;
	updatedBefore?: Date;
	session?: ClientSession;
} = {}): Promise<IRefund[]> {
	try {
		return (await Refund.find(
			{
				status: { $in: ["REFUND_PENDING", "REFUND_PROCESSING"] },
				paystackRefundId: { $exists: true },
				updatedAt: { $lte: updatedBefore },
			},
			null,
			{ session },
		)
			.sort({ updatedAt: 1 })
			.limit(Math.min(Math.max(limit, 1), 200))
			.lean()) as unknown as IRefund[];
	} catch {
		return [];
	}
}

export * from "./types";
