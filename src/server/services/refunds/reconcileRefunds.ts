import { getPaymentByIdDB, listRefundsForReconciliationDB } from "../../models";
import { paystackProvider } from "../../providers";
import { notifyAdminAttention } from "../notifications";
import { applyPaystackRefundState } from "./refundLifecycle";

export interface RefundReconciliationResult {
	scanned: number;
	reconciled: number;
	failed: number;
}

export async function reconcileRefunds({
	limit = 100,
}: {
	limit?: number;
} = {}): Promise<RefundReconciliationResult> {
	const refunds = await listRefundsForReconciliationDB({ limit });
	const result: RefundReconciliationResult = {
		scanned: refunds.length,
		reconciled: 0,
		failed: 0,
	};
	for (const refund of refunds) {
		const id = refund.id ?? refund._id.toString();
		try {
			if (!refund.paystackRefundId) continue;
			const payment = await getPaymentByIdDB({
				id: refund.paymentId.toString(),
			});
			if (!payment) throw new Error("Payment record not found.");
			const snapshot = await paystackProvider.getRefund(
				refund.paystackRefundId,
			);
			await applyPaystackRefundState({ refund, payment, snapshot });
			result.reconciled += 1;
		} catch (error) {
			result.failed += 1;
			const reason =
				error instanceof Error
					? error.message
					: "Unknown reconciliation error.";
			console.error(
				`[refunds] reconciliation failed refund=${id}:`,
				error,
			);
			await notifyAdminAttention({
				kind: "REFUND_REVIEW",
				title: "Refund reconciliation failed",
				whatHappened: reason,
				submittedBy: "Refund reconciliation job",
				recordId: id,
				adminPath: `/admin/orders?refundId=${encodeURIComponent(id)}`,
				dedupeKey: `refund-reconciliation-failed:${id}`,
			});
		}
	}
	return result;
}
