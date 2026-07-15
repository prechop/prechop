import { notFound, validationError } from "../../constants";
import {
	createRefundDB,
	getPaymentByOrderIdDB,
	markBuyerOrderRefundedDB,
	markPaymentRefundedDB,
	markRefundProcessedDB,
} from "../../models";
import { paystackProvider } from "../../providers";

export type RefundOutcome =
	/** This call inserted the refund row and moved the money. */
	| "REFUNDED"
	/** A refund row already existed — Paystack was NOT called again. */
	| "ALREADY_REFUNDED";

export interface IssueRefundResult {
	outcome: RefundOutcome;
	refundId: string;
	amountKobo: number;
	paystackRefundId?: string;
}

/**
 * The single place money leaves Prechop.
 *
 * Every refund path (buyer cancel, vendor cancel, listing cancel, the stale-PAID
 * cutoff sweep, and the admin manual refund) funnels through here so that a
 * `refunds` row — the reconciliation trail — is written for *every* payout, and
 * so the double-payout guard lives in exactly one place.
 *
 * Ordering is deliberate: the row is written BEFORE Paystack is called, never
 * after. `createRefundDB` upserts against a unique `paymentId` index and reports
 * whether *this* call inserted the row:
 *
 *   - `null`         → the write genuinely failed. Paystack is never called, so
 *                      the caller may safely retry.
 *   - `created:false` → someone already owns this refund. We must NOT call
 *                      Paystack; doing so pays the buyer twice.
 *   - `created:true`  → we own the payout, and only now do we call Paystack.
 *
 * If Paystack then fails, the row deliberately STAYS, with `processedAt` unset.
 * That is not a leak — it is the reconciliation queue the model's
 * `{processedAt:1, createdAt:1}` index exists to serve, and it is the safe side
 * of the trade: an unpaid refund is visible and fixable, a double payout is not
 * recoverable. The failure is logged loudly and thrown so no caller reports
 * success.
 */
export async function issueRefund({
	orderId,
	amountKobo,
	reason,
	paystackRef,
}: {
	orderId: string;
	amountKobo: number;
	reason: string;
	/** Defaults to the payment's own reference. */
	paystackRef?: string;
}): Promise<IssueRefundResult> {
	if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
		throw validationError("Refund amount must be a positive whole number.");
	}

	const payment = await getPaymentByOrderIdDB({ buyerOrderId: orderId });
	if (!payment) throw notFound("Payment for this order");

	const reference = paystackRef ?? payment.paystackRef;
	if (!reference) {
		throw validationError(
			"This order has no Paystack reference to refund against.",
		);
	}
	if (amountKobo > payment.amountKobo) {
		throw validationError(
			"Refund amount cannot exceed the amount actually paid.",
		);
	}

	const refund = await createRefundDB({
		payload: {
			paymentId: payment._id.toString(),
			amountKobo,
			reason,
		},
	});
	// null is a write failure, not "already refunded" — Paystack has not been
	// called, so surfacing a retryable error is correct.
	if (!refund) {
		throw validationError(
			"Could not record the refund. Please try again in a moment.",
		);
	}

	const refundId = refund.id ?? refund._id.toString();

	if (!refund.created) {
		// Double-payout guard. A refund already exists for this payment, so this
		// caller does not own the payout and must not touch Paystack.
		return {
			outcome: "ALREADY_REFUNDED",
			refundId,
			amountKobo: refund.amountKobo,
			paystackRefundId: refund.paystackRefundId,
		};
	}

	let paystackRefundId: string;
	try {
		const result = await paystackProvider.refund(reference, amountKobo);
		paystackRefundId = String(result.id);
	} catch (error) {
		console.error(
			`[refunds] PAYSTACK REFUND FAILED order=${orderId} refund=${refundId} amountKobo=${amountKobo} — row left unprocessed for reconciliation:`,
			error,
		);
		throw validationError(
			"Refund could not be processed automatically. Our team has been notified.",
		);
	}

	// Best-effort bookkeeping from here on: the money has already moved, so a
	// failure to stamp the row must not read as a failed refund to the caller.
	await markRefundProcessedDB({ id: refundId, paystackRefundId });
	await markPaymentRefundedDB({ buyerOrderId: orderId });
	await markBuyerOrderRefundedDB({ id: orderId });

	return {
		outcome: "REFUNDED",
		refundId,
		amountKobo,
		paystackRefundId,
	};
}
