import { IS_PROD } from "../../constants";
import type { IPayment, IRefund } from "../../models";
import {
	markBuyerOrderRefundedDB,
	markBuyerOrderRefundFailedDB,
	markBuyerOrderRefundPendingDB,
	markBuyerOrderRefundProcessingDB,
	markPaymentRefundedDB,
	markRefundFailedDB,
	markRefundNeedsAttentionDB,
	markRefundPendingDB,
	markRefundProcessedDB,
	markRefundProcessingDB,
} from "../../models";
import type { RefundResponse } from "../../providers/paystack";
import { notifyAdminAttention } from "../notifications";
import { openOrderDisputeForReview } from "../orderDisputes";
import { refreshVendorPayableForOrder } from "../vendorPayouts";
import { createPostPayoutRefundAdjustmentOnceDB, getVendorPayableByOrderIdDB, PaymentSettlementMode, paymentSettlementModeOf } from "../../models";

export type RefundOutcome =
	| "REFUNDED"
	| "ALREADY_REFUNDED"
	| "REFUND_PENDING"
	| "REFUND_PROCESSING"
	| "REFUND_NEEDS_ATTENTION"
	| "REFUND_FAILED";

export function existingRefundOutcome(refund: {
	status?: string;
	processedAt?: Date;
}): RefundOutcome {
	if (refund.processedAt || refund.status === "REFUNDED") {
		return "ALREADY_REFUNDED";
	}
	if (refund.status === "REFUND_PROCESSING") return "REFUND_PROCESSING";
	if (refund.status === "REFUND_NEEDS_ATTENTION") {
		return "REFUND_NEEDS_ATTENTION";
	}
	if (refund.status === "REFUND_FAILED") return "REFUND_FAILED";
	return "REFUND_PENDING";
}

function refundId(refund: IRefund): string {
	return refund.id ?? refund._id.toString();
}

function orderId(payment: IPayment): string {
	return payment.buyerOrderId.toString();
}

function expectedDomain(): "live" | "test" {
	return IS_PROD ? "live" : "test";
}

function snapshotTransactionReference(
	snapshot: RefundResponse,
): string | undefined {
	return typeof snapshot.transaction === "object"
		? snapshot.transaction.reference
		: undefined;
}

function validationMismatch(
	refund: IRefund,
	payment: IPayment,
	snapshot: RefundResponse,
): string | null {
	if (
		refund.paystackRefundId &&
		String(snapshot.id) !== refund.paystackRefundId
	) {
		return `Refund id mismatch: expected ${refund.paystackRefundId}, received ${snapshot.id}.`;
	}
	if (snapshot.amount !== refund.amountKobo) {
		return `Refund amount mismatch: expected ${refund.amountKobo} kobo, received ${snapshot.amount} kobo.`;
	}
	if (refund.amountKobo > payment.amountKobo) {
		return `Stored refund amount ${refund.amountKobo} exceeds payment amount ${payment.amountKobo}.`;
	}
	if (snapshot.currency && snapshot.currency !== "NGN") {
		return `Refund currency mismatch: expected NGN, received ${snapshot.currency}.`;
	}
	if (snapshot.domain && snapshot.domain !== expectedDomain()) {
		return `Refund domain mismatch: expected ${expectedDomain()}, received ${snapshot.domain}.`;
	}
	const reference = snapshotTransactionReference(snapshot);
	if (reference && reference !== payment.paystackRef) {
		return "Refund transaction reference does not match the stored payment reference.";
	}
	return null;
}

async function alertRefundReview({
	refund,
	payment,
	title,
	reason,
	dedupeSuffix,
}: {
	refund: IRefund;
	payment: IPayment;
	title: string;
	reason: string;
	dedupeSuffix: string;
}): Promise<void> {
	const id = refundId(refund);
	await notifyAdminAttention({
		kind: "REFUND_REVIEW",
		title,
		whatHappened: reason,
		submittedBy: "System refund workflow",
		recordId: id,
		adminPath: `/admin/orders?orderId=${encodeURIComponent(orderId(payment))}&refundId=${encodeURIComponent(id)}`,
		dedupeKey: `refund-${dedupeSuffix}:${id}`,
		severity: "critical",
		references: {
			orderId: orderId(payment),
			refundId: id,
			paymentId: payment._id.toString(),
		},
	});
}

export async function recordRefundFailure({
	orderId: buyerOrderId,
	failureReason,
}: {
	orderId: string;
	failureReason: string;
}): Promise<void> {
	await markBuyerOrderRefundFailedDB({
		id: buyerOrderId,
		failedAt: new Date(),
		failureReason,
	});
	await openOrderDisputeForReview({
		orderId: buyerOrderId,
		reason: "REFUND_FAILURE",
		vendorNotes: [failureReason],
	}).catch((error) =>
		console.error(
			`[refunds] failed to open refund-failure admin review for ${buyerOrderId}:`,
			error,
		),
	);
}

export async function applyPaystackRefundState({
	refund,
	payment,
	snapshot,
}: {
	refund: IRefund;
	payment: IPayment;
	snapshot: RefundResponse;
}): Promise<RefundOutcome> {
	if (refund.status === "REFUNDED" || refund.processedAt) {
		return "ALREADY_REFUNDED";
	}
	const id = refundId(refund);
	const buyerOrderId = orderId(payment);
	const paystackRefundId = String(snapshot.id);
	const mismatch = validationMismatch(refund, payment, snapshot);
	if (mismatch) {
		await markRefundNeedsAttentionDB({
			id,
			paystackRefundId,
			reason: mismatch,
		});
		await recordRefundFailure({
			orderId: buyerOrderId,
			failureReason: mismatch,
		});
		await alertRefundReview({
			refund,
			payment,
			title: "Refund reconciliation mismatch",
			reason: mismatch,
			dedupeSuffix: "mismatch",
		});
		return "REFUND_NEEDS_ATTENTION";
	}

	const status = snapshot.status.toLowerCase();
	if (status === "processed") {
		const paymentUpdated = await markPaymentRefundedDB({ buyerOrderId });
		const orderUpdated = await markBuyerOrderRefundedDB({
			id: buyerOrderId,
		});
		if (!paymentUpdated || !orderUpdated) {
			const reason =
				"Paystack confirmed the refund, but the local payment/order finalization did not complete. Reconciliation will retry it.";
			await alertRefundReview({
				refund,
				payment,
				title: "Refund finalization needs reconciliation",
				reason,
				dedupeSuffix: "finalization",
			});
			throw new Error(reason);
		}
		if (!(await markRefundProcessedDB({ id, paystackRefundId }))) {
			throw new Error(
				"Paystack confirmed the refund, but its local audit row could not be finalized.",
			);
		}
		if (paymentSettlementModeOf(payment) === PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2) {
			const payable = await getVendorPayableByOrderIdDB({ buyerOrderId });
			if (payable?.status === "PAID") {
				await createPostPayoutRefundAdjustmentOnceDB({
					vendorId: payment.vendorId.toString(),
					buyerOrderId,
					paymentId: payment._id.toString(),
					refundId: id,
					amountKobo: Math.min(refund.amountKobo, payable.amountKobo),
					reason: "Refund processed after vendor payout completed.",
				});
			}
		}
		await refreshVendorPayableForOrder({ orderId: buyerOrderId });
		return "REFUNDED";
	}
	if (status === "processing") {
		await markRefundProcessingDB({ id });
		await markBuyerOrderRefundProcessingDB({
			id: buyerOrderId,
			processedAt: new Date(),
		});
		await refreshVendorPayableForOrder({ orderId: buyerOrderId });
		return "REFUND_PROCESSING";
	}
	if (status === "pending") {
		const expectedAt = snapshot.expected_at
			? new Date(snapshot.expected_at)
			: undefined;
		await markRefundPendingDB({
			id,
			paystackRefundId,
			expectedAt:
				expectedAt && !Number.isNaN(expectedAt.getTime())
					? expectedAt
					: undefined,
		});
		await markBuyerOrderRefundPendingDB({
			id: buyerOrderId,
			pendingAt: new Date(),
		});
		await refreshVendorPayableForOrder({ orderId: buyerOrderId });
		return "REFUND_PENDING";
	}
	if (status === "needs-attention") {
		const reason = "Paystack reports that this refund needs attention.";
		await markRefundNeedsAttentionDB({ id, paystackRefundId, reason });
		await recordRefundFailure({
			orderId: buyerOrderId,
			failureReason: reason,
		});
		await alertRefundReview({
			refund,
			payment,
			title: "Paystack refund needs attention",
			reason,
			dedupeSuffix: "needs-attention",
		});
		return "REFUND_NEEDS_ATTENTION";
	}
	if (status === "failed") {
		const reason = "Paystack reports that this refund failed.";
		await markRefundFailedDB({
			id,
			failureReason: reason,
			paystackStatus: "failed",
			lastReconciledAt: new Date(),
		});
		await recordRefundFailure({
			orderId: buyerOrderId,
			failureReason: reason,
		});
		await alertRefundReview({
			refund,
			payment,
			title: "Paystack refund failed",
			reason,
			dedupeSuffix: "failed",
		});
		return "REFUND_FAILED";
	}

	const reason = `Unknown Paystack refund status: ${snapshot.status}.`;
	await markRefundNeedsAttentionDB({ id, paystackRefundId, reason });
	await recordRefundFailure({ orderId: buyerOrderId, failureReason: reason });
	await alertRefundReview({
		refund,
		payment,
		title: "Unknown Paystack refund status",
		reason,
		dedupeSuffix: "unknown-status",
	});
	return "REFUND_NEEDS_ATTENTION";
}
