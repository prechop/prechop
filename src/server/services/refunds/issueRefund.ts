import crypto from "node:crypto";
import { notFound, validationError } from "../../constants";
import { acquireLock, releaseLock } from "../../databases";
import {
	createRefundDB,
	getPaymentByOrderIdDB,
	getRefundByIdDB,
	markRefundFailedDB,
	recordRefundSubmissionAttemptDB,
} from "../../models";
import { paystackProvider } from "../../providers";
import type { RefundResponse } from "../../providers/paystack";
import { notifyAdminAttention } from "../notifications";
import { holdVendorPayableForOrder } from "../vendorPayouts";
import {
	applyPaystackRefundState,
	existingRefundOutcome,
	type RefundOutcome,
	recordRefundFailure,
} from "./refundLifecycle";

const FAILED_REFUND_RETRY_COOLDOWN_MS = 5 * 60 * 1000;

export type { RefundOutcome } from "./refundLifecycle";

export interface IssueRefundResult {
	outcome: RefundOutcome;
	refundId: string;
	amountKobo: number;
	paystackRefundId?: string;
}

function refundFailureMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	return "Paystack refund request failed.";
}

async function alertSubmissionFailure({
	orderId,
	refundId,
	failureReason,
}: {
	orderId: string;
	refundId: string;
	failureReason: string;
}): Promise<void> {
	await notifyAdminAttention({
		kind: "REFUND_REVIEW",
		title: "Paystack refund request failed",
		whatHappened: failureReason,
		submittedBy: "System refund workflow",
		recordId: refundId,
		adminPath: `/admin/orders?orderId=${encodeURIComponent(orderId)}&refundId=${encodeURIComponent(refundId)}`,
		dedupeKey: `refund-submission-failed:${refundId}`,
		severity: "critical",
	});
}

/**
 * Submit one logical refund per payment. Paystack accepting POST /refund only
 * means the refund is queued; final Payment and Order REFUNDED states are set
 * later, exclusively after Paystack reports `processed`.
 *
 * A failed local attempt can be retried, but only after querying Paystack for
 * an already-created refund. If that lookup is inconclusive, this function
 * refuses to send another POST so a timeout can never become a double refund.
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
	paystackRef?: string;
}): Promise<IssueRefundResult> {
	if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
		throw validationError("Refund amount must be a positive whole number.");
	}

	const payment = await getPaymentByOrderIdDB({ buyerOrderId: orderId });
	if (!payment) {
		const failureReason = "Payment for this order not found.";
		await recordRefundFailure({ orderId, failureReason });
		await notifyAdminAttention({
			kind: "PAYMENT_ISSUE",
			title: "Refund needs manual review",
			whatHappened: failureReason,
			submittedBy: "System refund workflow",
			recordId: orderId,
			adminPath: `/admin/orders?orderId=${encodeURIComponent(orderId)}`,
			dedupeKey: `refund-payment-missing:${orderId}`,
		});
		throw notFound("Payment for this order");
	}

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
	if (paystackRef && paystackRef !== payment.paystackRef) {
		throw validationError(
			"Refund reference does not match the stored payment reference.",
		);
	}

	const financialLockKey = `financial:payment:${payment._id.toString()}`;
	const financialLockValue = crypto.randomUUID();
	if (!(await acquireLock(financialLockKey, financialLockValue, 30))) {
		throw validationError(
			"This payment is being updated. No refund was sent; please retry shortly.",
		);
	}
	let refund: Awaited<ReturnType<typeof createRefundDB>>;
	try {
		refund = await createRefundDB({
			payload: { paymentId: payment._id.toString(), amountKobo, reason },
		});
		if (refund) {
			await holdVendorPayableForOrder({
				orderId,
				reasonCode: "REFUND_PENDING",
				note: reason,
				refundId: refund.id ?? refund._id.toString(),
			});
		}
	} finally {
		await releaseLock(financialLockKey, financialLockValue);
	}
	if (!refund) {
		await notifyAdminAttention({
			kind: "REFUND_REVIEW",
			title: "Refund record could not be created",
			whatHappened:
				"A refund was requested, but its audit record could not be created.",
			submittedBy: "System refund workflow",
			recordId: orderId,
			adminPath: `/admin/orders?orderId=${encodeURIComponent(orderId)}`,
			dedupeKey: `refund-record-create-failed:${orderId}`,
		});
		throw validationError(
			"Could not record the refund. Please try again in a moment.",
		);
	}

	const refundId = refund.id ?? refund._id.toString();
	if (refund.amountKobo !== amountKobo) {
		throw validationError(
			"A refund with a different amount already exists for this payment.",
		);
	}
	if (!refund.created && refund.status !== "REFUND_FAILED") {
		return {
			outcome: existingRefundOutcome(refund),
			refundId,
			amountKobo: refund.amountKobo,
			paystackRefundId: refund.paystackRefundId,
		};
	}

	const lockKey = `refund:submit:${refundId}`;
	const lockValue = crypto.randomUUID();
	if (!(await acquireLock(lockKey, lockValue, 30))) {
		const current = await getRefundByIdDB({ id: refundId });
		return {
			outcome: existingRefundOutcome(current ?? refund),
			refundId,
			amountKobo: refund.amountKobo,
			paystackRefundId:
				current?.paystackRefundId ?? refund.paystackRefundId,
		};
	}

	try {
		const current = (await getRefundByIdDB({ id: refundId })) ?? refund;
		if (!refund.created && current.status !== "REFUND_FAILED") {
			return {
				outcome: existingRefundOutcome(current),
				refundId,
				amountKobo: current.amountKobo,
				paystackRefundId: current.paystackRefundId,
			};
		}

		if (!refund.created) {
			if (
				current.failedAt &&
				current.failedAt.getTime() + FAILED_REFUND_RETRY_COOLDOWN_MS >
					Date.now()
			) {
				throw validationError(
					"The previous refund attempt is still within its reconciliation window. No retry was sent.",
				);
			}
			let discovered: RefundResponse | null;
			try {
				discovered = current.paystackRefundId
					? await paystackProvider.getRefund(current.paystackRefundId)
					: await paystackProvider.findRefundForTransaction(
							reference,
							amountKobo,
						);
			} catch (error) {
				const failureReason = `Could not reconcile the existing refund before retry: ${refundFailureMessage(error)}`;
				await alertSubmissionFailure({
					orderId,
					refundId,
					failureReason,
				});
				throw validationError(
					"Refund status could not be confirmed, so no retry was sent. Our team has been notified.",
				);
			}
			if (discovered) {
				await recordRefundSubmissionAttemptDB({
					id: refundId,
					kind: "RETRY",
					outcome: "DISCOVERED",
					paystackRefundId: String(discovered.id),
					paystackStatus: discovered.status,
				});
				const outcome = await applyPaystackRefundState({
					refund: current,
					payment,
					snapshot: discovered,
				});
				if (outcome !== "REFUND_FAILED") {
					return {
						outcome,
						refundId,
						amountKobo,
						paystackRefundId: String(discovered.id),
					};
				}
			}
		}

		let result: RefundResponse;
		try {
			result = await paystackProvider.refund(reference, amountKobo);
			await recordRefundSubmissionAttemptDB({
				id: refundId,
				kind: refund.created ? "INITIAL" : "RETRY",
				outcome: "ACCEPTED",
				paystackRefundId: String(result.id),
				paystackStatus: result.status,
			});
		} catch (error) {
			const failureReason = refundFailureMessage(error);
			await recordRefundSubmissionAttemptDB({
				id: refundId,
				kind: refund.created ? "INITIAL" : "RETRY",
				outcome: "FAILED",
				error: failureReason,
			});
			await markRefundFailedDB({ id: refundId, failureReason });
			await recordRefundFailure({ orderId, failureReason });
			await alertSubmissionFailure({ orderId, refundId, failureReason });
			console.error(
				`[refunds] Paystack refund request failed order=${orderId} refund=${refundId} amountKobo=${amountKobo}:`,
				error,
			);
			throw validationError(
				"Refund could not be submitted automatically. Our team has been notified.",
			);
		}

		const outcome = await applyPaystackRefundState({
			refund: current,
			payment,
			snapshot: result,
		});
		return {
			outcome,
			refundId,
			amountKobo,
			paystackRefundId: String(result.id),
		};
	} finally {
		await releaseLock(lockKey, lockValue);
	}
}
