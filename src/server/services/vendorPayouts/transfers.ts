import {
	getPayoutV2SafetyState,
	isPayoutV2FoundationEnabled,
} from "@/server/constants";
import {
	createPostPayoutRefundAdjustmentOnceDB,
	getPayoutByTransferIdentityDB,
	getRefundByPaymentIdDB,
	listPayoutLinesDB,
	listPayoutsForReconciliationDB,
	markPayoutFinalStateDB,
	markPayoutPayablesDB,
} from "@/server/models";
import { paystackProvider } from "@/server/providers";
import type { PaystackTransferResponse } from "@/server/providers/paystack";
import { notifyAdminAttention } from "../notifications";

export interface PaystackTransferEvent {
	event: "transfer.success" | "transfer.failed" | "transfer.reversed";
	data: PaystackTransferResponse;
}

export async function applyPaystackTransferState(
	event: PaystackTransferEvent,
): Promise<void> {
	if (!isPayoutV2FoundationEnabled(getPayoutV2SafetyState())) return;
	const payout = await getPayoutByTransferIdentityDB({
		reference: event.data.reference,
		code: event.data.transfer_code,
	});
	if (!payout) {
		await notifyAdminAttention({
			kind: "PAYMENT_ISSUE",
			title: "Unknown Paystack transfer event",
			whatHappened: `No payout matches transfer ${event.data.reference}.`,
			submittedBy: "Paystack webhook",
			recordId: event.data.reference,
			adminPath: "/admin/payments",
			dedupeKey: `unknown-transfer:${event.data.reference}:${event.event}`,
		});
		return;
	}
	const matchingAttempt =
		payout.paystackTransferReference === event.data.reference ||
		(payout.transferAttempts ?? []).some(
			(attempt) =>
				attempt.reference === event.data.reference &&
				(!event.data.transfer_code ||
					attempt.code === event.data.transfer_code),
		);
	if (!matchingAttempt) return;
	if (
		event.data.amount !== payout.totalAmountKobo ||
		event.data.currency !== payout.currency
	) {
		await notifyAdminAttention({
			kind: "PAYMENT_ISSUE",
			title: "Paystack transfer reconciliation mismatch",
			whatHappened: `Transfer ${event.data.reference} amount/currency does not match payout ${String(payout.id ?? payout._id)}.`,
			submittedBy: "Paystack webhook",
			recordId: String(payout.id ?? payout._id),
			adminPath: "/admin/payments",
			dedupeKey: `transfer-mismatch:${event.data.reference}`,
			severity: "critical",
		});
		return;
	}
	const payoutId = String(payout.id ?? payout._id);
	if (event.event === "transfer.success") {
		await markPayoutFinalStateDB({ id: payoutId, status: "PAID" });
		await markPayoutPayablesDB({ payoutId, status: "PAID" });
		const lines = await listPayoutLinesDB({ payoutId });
		for (const line of lines) {
			const refund = await getRefundByPaymentIdDB({
				paymentId: String(line.paymentId),
			});
			if (refund?.status !== "REFUNDED") continue;
			await createPostPayoutRefundAdjustmentOnceDB({
				vendorId: String(line.vendorId),
				buyerOrderId: String(line.buyerOrderId),
				paymentId: String(line.paymentId),
				refundId: String(refund.id ?? refund._id),
				amountKobo: Math.min(refund.amountKobo, line.amountKobo),
				reason: "Refund processed while the vendor transfer was already in flight.",
			});
		}
		return;
	}
	if (event.event === "transfer.reversed") {
		await markPayoutFinalStateDB({
			id: payoutId,
			status: "REVERSED",
			reason: event.data.reason ?? "Paystack reversed transfer",
		});
		await markPayoutPayablesDB({ payoutId, status: "ELIGIBLE" });
		return;
	}
	if (payout.status === "PAID") return;
	await markPayoutFinalStateDB({
		id: payoutId,
		status: "FAILED",
		reason: event.data.reason ?? "Paystack transfer failed",
	});
	await markPayoutPayablesDB({ payoutId, status: "ELIGIBLE" });
}

export async function reconcileVendorPayoutTransfers(
	input: { limit?: number } = {},
): Promise<{ checked: number }> {
	if (!isPayoutV2FoundationEnabled(getPayoutV2SafetyState()))
		return { checked: 0 };
	const payouts = await listPayoutsForReconciliationDB({
		limit: input.limit ?? 50,
	});
	let checked = 0;
	for (const payout of payouts) {
		if (!payout.paystackTransferReference) continue;
		try {
			const transfer = await paystackProvider.verifyTransfer(
				payout.paystackTransferReference,
			);
			const event =
				transfer.status === "success"
					? "transfer.success"
					: transfer.status === "reversed"
						? "transfer.reversed"
						: transfer.status === "failed"
							? "transfer.failed"
							: null;
			if (event)
				await applyPaystackTransferState({ event, data: transfer });
			checked += 1;
		} catch (error) {
			console.error(
				`[payouts] transfer reconciliation failed payout=${String(payout.id ?? payout._id)}:`,
				error,
			);
		}
	}
	return { checked };
}
