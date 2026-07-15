import { issueRefund } from "../refunds";

/**
 * Refund a paid order through Paystack, then flip the payment + order to
 * REFUNDED. A failed Paystack refund throws (and is logged) so a human can
 * reconcile — we never silently swallow a failed refund.
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
}): Promise<void> {
	await issueRefund({ orderId, paystackRef, amountKobo, reason });
}
