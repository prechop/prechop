import {
	getPaymentByIdDB,
	getPaymentByRefDB,
	getRefundByPaymentIdDB,
	getRefundByPaystackRefundIdDB,
} from "../../models";
import type { RefundResponse } from "../../providers/paystack";
import { notifyAdminAttention } from "../notifications";
import { applyPaystackRefundState } from "./refundLifecycle";

interface RefundWebhookEvent {
	event: string;
	data: {
		id?: number | string;
		status?: string;
		amount?: number | string;
		currency?: string;
		domain?: string;
		expected_at?: string | null;
		refunded_at?: string | null;
		transaction_reference?: string;
		transaction?:
			| number
			| {
					id?: number;
					reference?: string;
					currency?: string;
					domain?: string;
			  };
	};
}

function transactionReference(event: RefundWebhookEvent): string | undefined {
	return (
		event.data.transaction_reference ??
		(typeof event.data.transaction === "object"
			? event.data.transaction.reference
			: undefined)
	);
}

export async function handleRefundWebhook(
	event: RefundWebhookEvent,
): Promise<void> {
	const reference = transactionReference(event);
	let payment = reference
		? await getPaymentByRefDB({ paystackRef: reference })
		: null;
	let refund = payment
		? await getRefundByPaymentIdDB({ paymentId: payment._id.toString() })
		: null;

	if (!refund && event.data.id != null) {
		refund = await getRefundByPaystackRefundIdDB({
			paystackRefundId: String(event.data.id),
		});
		if (refund) {
			payment = await getPaymentByIdDB({
				id: refund.paymentId.toString(),
			});
		}
	}

	if (!refund || !payment) {
		const recordId = String(event.data.id ?? reference ?? "unknown");
		await notifyAdminAttention({
			kind: "REFUND_REVIEW",
			title: "Unmatched Paystack refund webhook",
			whatHappened: `Paystack sent ${event.event}, but no matching local refund and payment were found.`,
			submittedBy: "Paystack webhook",
			recordId,
			adminPath: "/admin/orders",
			dedupeKey: `refund-webhook-unmatched:${event.event}:${recordId}`,
			severity: "critical",
		});
		return;
	}

	const id = Number(event.data.id ?? refund.paystackRefundId);
	const amount = Number(event.data.amount ?? refund.amountKobo);
	if (!Number.isFinite(id) || !Number.isFinite(amount)) {
		await notifyAdminAttention({
			kind: "REFUND_REVIEW",
			title: "Invalid Paystack refund webhook",
			whatHappened:
				"The refund webhook did not contain a usable refund id or amount.",
			submittedBy: "Paystack webhook",
			recordId: refund.id ?? refund._id.toString(),
			adminPath: `/admin/orders?orderId=${encodeURIComponent(payment.buyerOrderId.toString())}`,
			dedupeKey: `refund-webhook-invalid:${refund.id ?? refund._id.toString()}`,
			severity: "critical",
		});
		return;
	}

	const eventStatus = event.event.replace(/^refund\./, "");
	const dataStatus = event.data.status?.toLowerCase();
	const status =
		dataStatus && dataStatus !== eventStatus
			? `event-data-mismatch:${eventStatus}:${dataStatus}`
			: eventStatus || dataStatus || "";
	const snapshot: RefundResponse = {
		id,
		amount,
		status,
		currency: event.data.currency,
		domain: event.data.domain,
		expected_at: event.data.expected_at,
		refunded_at: event.data.refunded_at,
		transaction: event.data.transaction,
	};
	await applyPaystackRefundState({ refund, payment, snapshot });
}
