import { validationError } from "../../constants";
import { markBuyerOrderRefundedDB, markPaymentRefundedDB } from "../../models";
import { paystackProvider } from "../../providers";

/**
 * Refund a paid order through Paystack, then flip the payment + order to
 * REFUNDED. A failed Paystack refund throws (and is logged) so a human can
 * reconcile — we never silently swallow a failed refund.
 */
export async function refundBuyerOrder({
	orderId,
	paystackRef,
	amountKobo,
}: {
	orderId: string;
	paystackRef: string;
	amountKobo: number;
}): Promise<void> {
	try {
		await paystackProvider.refund(paystackRef, amountKobo);
		await markPaymentRefundedDB({ buyerOrderId: orderId });
		await markBuyerOrderRefundedDB({ id: orderId });
	} catch (error) {
		console.error(`REFUND FAILED for order ${orderId}:`, error);
		throw validationError(
			"Refund could not be processed automatically. Our team has been notified.",
		);
	}
}
