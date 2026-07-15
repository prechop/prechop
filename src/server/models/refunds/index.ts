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
		// Integer kobo. min:0 so a negative "refund" — which would be a silent
		// credit against the payment — cannot be stored at all.
		amountKobo: { type: Number, required: true, min: 0 },
		reason: { type: String, required: true },
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
	},
	{ timestamps: true },
);

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
					...(payload.paystackRefundId
						? { paystackRefundId: payload.paystackRefundId }
						: {}),
					...(payload.processedAt
						? { processedAt: payload.processedAt }
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
