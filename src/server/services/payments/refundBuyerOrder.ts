import { type IssueRefundResult, issueRefund } from "../refunds";

/**
 * Start a paid-order refund through Paystack. The payment and order remain in
 * refund-pending/processing states until a webhook or reconciliation lookup
 * confirms Paystack's final `processed` status. A failed submission throws so
 * it is never silently reported as completed.
 *
 * Thin wrapper kept for its existing callers (buyer cancel, vendor cancel,
 * listing cancel). The money mechanics — writing the `refunds` row that gives
 * finance a reconciliation trail, and gating the Paystack call on winning that
 * insert so a double-cancel cannot pay the buyer twice — live in
 * `services/refunds/issueRefund`.
 */
export async function refundBuyerOrder({
	orderId,
	paystackRef,
	amountKobo,
	reason = "Order cancelled.",
}: {
	orderId: string;
	paystackRef: string;
	amountKobo: number;
	reason?: string;
}): Promise<IssueRefundResult> {
	return issueRefund({ orderId, paystackRef, amountKobo, reason });
}
