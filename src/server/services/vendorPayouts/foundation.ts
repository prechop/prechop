import { getPayoutV2SafetyState } from "@/server/constants";
import {
	createVendorPayableOnceDB,
	getActiveVendorTransferRecipientDB,
	getBuyerOrderByIdDB,
	getPaymentByOrderIdDB,
	getRefundByPaymentIdDB,
	getVendorPayableByOrderIdDB,
	listOrderDisputesDB,
	OrderStatus,
	PaymentSettlementMode,
	paymentSettlementModeOf,
	setVendorPayableHoldDB,
	updateVendorPayableEvaluationDB,
} from "@/server/models";
import { evaluatePayoutEligibility } from "./eligibility";

function idOf(value: unknown): string {
	return String(value ?? "");
}

function holdReason(
	reason: string,
):
	| "OPEN_DISPUTE"
	| "REFUND_PENDING"
	| "BANK_ACCOUNT_REVIEW"
	| "BUYER_NO_SHOW"
	| "ORDER_REVIEW" {
	if (reason === "OPEN_DISPUTE") return "OPEN_DISPUTE";
	if (reason === "REFUND_BLOCKING") return "REFUND_PENDING";
	if (reason.startsWith("RECIPIENT_")) return "BANK_ACCOUNT_REVIEW";
	return "ORDER_REVIEW";
}

/**
 * Central V2 lifecycle entry point. Every caller may invoke it repeatedly;
 * V1 payments no-op and V2 writes are idempotent by payment/order uniqueness.
 */
export async function refreshVendorPayableForOrder({
	orderId,
}: {
	orderId: string;
}): Promise<void> {
	const state = getPayoutV2SafetyState();
	if (!state.foundationEnabled) return;
	const [order, payment] = await Promise.all([
		getBuyerOrderByIdDB({ id: orderId }),
		getPaymentByOrderIdDB({ buyerOrderId: orderId }),
	]);
	if (!order || !payment) return;
	if (
		paymentSettlementModeOf(payment) !==
		PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2
	)
		return;
	if (!order.confirmedAt || !order.confirmationMethod) return;

	const paymentId = idOf(payment.id ?? payment._id);
	const vendorId = idOf(payment.vendorId);
	const [disputes, refund, recipient, existing] = await Promise.all([
		listOrderDisputesDB({ buyerOrderId: orderId, limit: 100 }),
		getRefundByPaymentIdDB({ paymentId }),
		getActiveVendorTransferRecipientDB({ vendorId }),
		getVendorPayableByOrderIdDB({ buyerOrderId: orderId }),
	]);
	const activeDisputes = disputes.filter(
		(item) => item.status !== "RESOLVED",
	);
	const completionReference =
		order.trustedCompletionAuditRef ??
		(order.confirmationOrderId
			? String(order.confirmationOrderId)
			: undefined) ??
		`${orderId}:${order.confirmationMethod}:${order.confirmedAt.toISOString()}`;
	const eligibility = evaluatePayoutEligibility({
		v2Enabled: state.foundationEnabled,
		now: new Date(),
		payment: {
			id: paymentId,
			buyerOrderId: idOf(payment.buyerOrderId),
			vendorId,
			settlementMode: payment.settlementMode,
			status: payment.status,
			webhookVerified: payment.webhookVerified,
			paidAt: payment.paidAt,
		},
		order: {
			id: orderId,
			vendorId: idOf(order.vendorId),
			status: order.status,
		},
		trustedCompletion: {
			trustedCompletionAt: order.confirmedAt,
			confirmationMethod: order.confirmationMethod,
			confirmationReference: completionReference,
			confirmedBy: order.confirmedBy
				? idOf(order.confirmedBy)
				: undefined,
		},
		activeDisputeIds: activeDisputes.map((item) =>
			idOf(item.id ?? item._id),
		),
		refund: refund
			? { id: idOf(refund.id ?? refund._id), status: refund.status }
			: null,
		payoutHold: existing?.hold,
		recipient: recipient
			? {
					id: idOf(recipient.id ?? recipient._id),
					vendorId: idOf(recipient.vendorId),
					version: recipient.version,
					status: recipient.status,
					verifiedAt: recipient.verifiedAt,
				}
			: null,
	});
	if (!eligibility.trustedCompletionAt || !eligibility.payoutEligibleAt)
		return;
	const noShow = order.status === OrderStatus.COMPLETED_BUYER_NO_SHOW;
	const isGrace = eligibility.reason === "GRACE_PERIOD_ACTIVE";
	const isEligible = eligibility.reason === "ELIGIBLE" && !noShow;
	const status = isEligible
		? "ELIGIBLE"
		: isGrace && !noShow
			? "GRACE_PERIOD"
			: "HELD";
	const reasonCode = noShow
		? "BUYER_NO_SHOW"
		: holdReason(eligibility.reason);

	if (!existing) {
		await createVendorPayableOnceDB({
			payload: {
				buyerOrderId: orderId,
				paymentId,
				vendorId,
				amountKobo:
					payment.vendorSettlementKobo ?? payment.vendorAmountKobo,
				settlementMode:
					PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2,
				trustedCompletionAt: eligibility.trustedCompletionAt,
				payoutEligibleAt: eligibility.payoutEligibleAt,
				eligibilityEvidence: {
					confirmationMethod: order.confirmationMethod,
					confirmationReference: completionReference,
					confirmedBy: order.confirmedBy
						? idOf(order.confirmedBy)
						: undefined,
					paymentVerifiedAt: payment.paidAt as Date,
					evaluatedAt: eligibility.evaluatedAt,
					evaluatorVersion: eligibility.evaluatorVersion,
				},
				linkedDisputeIds: activeDisputes.map((item) =>
					idOf(item.id ?? item._id),
				),
				linkedRefundId: refund
					? idOf(refund.id ?? refund._id)
					: undefined,
				idempotencyKey: `vendor-payable:v2:${paymentId}`,
				initialStatus: status,
				initialHold:
					status === "HELD"
						? {
								active: true,
								reasonCode,
								heldAt: new Date(),
								note: eligibility.reason,
							}
						: { active: false },
			},
		});
		return;
	}
	if (status === "HELD") {
		await setVendorPayableHoldDB({
			buyerOrderId: orderId,
			reasonCode,
			note: eligibility.reason,
			linkedDisputeId: activeDisputes[0]
				? idOf(activeDisputes[0].id ?? activeDisputes[0]._id)
				: undefined,
			linkedRefundId: refund ? idOf(refund.id ?? refund._id) : undefined,
		});
		return;
	}
	await updateVendorPayableEvaluationDB({
		id: idOf(existing.id ?? existing._id),
		status,
		hold: { active: false, releasedAt: new Date() },
	});
}

export async function holdVendorPayableForOrder(input: {
	orderId: string;
	reasonCode: Parameters<typeof setVendorPayableHoldDB>[0]["reasonCode"];
	note?: string;
	actorId?: string;
	disputeId?: string;
	refundId?: string;
}): Promise<void> {
	if (!getPayoutV2SafetyState().foundationEnabled) return;
	await setVendorPayableHoldDB({
		buyerOrderId: input.orderId,
		reasonCode: input.reasonCode,
		note: input.note,
		heldBy: input.actorId,
		linkedDisputeId: input.disputeId,
		linkedRefundId: input.refundId,
	});
}
