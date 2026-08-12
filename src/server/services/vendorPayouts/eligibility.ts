import { PAYOUT_V2_GRACE_PERIOD_MS } from "@/server/constants";
import {
	OrderStatus,
	PaymentSettlementMode,
	PaymentStatus,
	paymentSettlementModeOf,
} from "@/server/models";
import type { RefundStatus } from "@/server/models/refunds";

export const PAYOUT_ELIGIBILITY_EVALUATOR_VERSION = "2026-08-11.v1";
export const PAYOUT_GRACE_PERIOD_MS = PAYOUT_V2_GRACE_PERIOD_MS;

export type PayoutEligibilityReason =
	| "FEATURE_DISABLED"
	| "SETTLEMENT_MODE_NOT_V2"
	| "PAYMENT_NOT_SUCCESSFUL"
	| "PAYMENT_NOT_VERIFIED"
	| "ORDER_PAYMENT_MISMATCH"
	| "ORDER_VENDOR_MISMATCH"
	| "ORDER_NOT_FINANCIALLY_COMPLETABLE"
	| "TRUSTED_COMPLETION_MISSING"
	| "TRUSTED_COMPLETION_EVIDENCE_INVALID"
	| "TRUSTED_COMPLETION_IN_FUTURE"
	| "GRACE_PERIOD_ACTIVE"
	| "OPEN_DISPUTE"
	| "REFUND_BLOCKING"
	| "PAYOUT_HOLD_ACTIVE"
	| "RECIPIENT_MISSING"
	| "RECIPIENT_NOT_ACTIVE"
	| "RECIPIENT_NOT_VERIFIED"
	| "RECIPIENT_VENDOR_MISMATCH"
	| "ELIGIBLE";

export interface TrustedCompletionEvidenceInput {
	trustedCompletionAt?: Date;
	confirmationMethod?: "QR" | "PIN" | "SUPPORT";
	confirmationReference?: string;
	confirmedBy?: string;
}

export interface PayoutEligibilityInput {
	v2Enabled: boolean;
	now: Date;
	payment: {
		id: string;
		buyerOrderId: string;
		vendorId: string;
		settlementMode?: PaymentSettlementMode | string | null;
		status: PaymentStatus;
		webhookVerified: boolean;
		paidAt?: Date;
	};
	order: {
		id: string;
		vendorId: string;
		status: OrderStatus;
	};
	trustedCompletion: TrustedCompletionEvidenceInput;
	activeDisputeIds: string[];
	refund?: { id: string; status?: RefundStatus } | null;
	payoutHold?: { active: boolean; reason?: string } | null;
	recipient?: {
		id: string;
		vendorId: string;
		version: number;
		status: "ACTIVE" | "RETIRED";
		verifiedAt?: Date;
	} | null;
}

export interface PayoutEligibilityResult {
	eligible: boolean;
	reason: PayoutEligibilityReason;
	evaluatedAt: Date;
	payoutEligibleAt?: Date;
	trustedCompletionAt?: Date;
	evaluatorVersion: string;
	blockingReferenceIds: string[];
}

function result(
	input: PayoutEligibilityInput,
	reason: PayoutEligibilityReason,
	extra: Partial<PayoutEligibilityResult> = {},
): PayoutEligibilityResult {
	return {
		eligible: reason === "ELIGIBLE",
		reason,
		evaluatedAt: input.now,
		evaluatorVersion: PAYOUT_ELIGIBILITY_EVALUATOR_VERSION,
		blockingReferenceIds: [],
		...extra,
	};
}

/**
 * The only business-rule evaluator for V2 payable eligibility. It is pure so
 * webhooks, completion handlers, reconciliation, and jobs can share the same
 * decision without embedding status shortcuts in each caller.
 */
export function evaluatePayoutEligibility(
	input: PayoutEligibilityInput,
): PayoutEligibilityResult {
	if (!input.v2Enabled) return result(input, "FEATURE_DISABLED");
	if (
		paymentSettlementModeOf(input.payment) !==
		PaymentSettlementMode.PLATFORM_BALANCE_TRANSFER_V2
	) {
		return result(input, "SETTLEMENT_MODE_NOT_V2");
	}
	if (input.payment.status !== PaymentStatus.SUCCESS) {
		return result(input, "PAYMENT_NOT_SUCCESSFUL");
	}
	if (!input.payment.webhookVerified || !input.payment.paidAt) {
		return result(input, "PAYMENT_NOT_VERIFIED");
	}
	if (input.payment.buyerOrderId !== input.order.id) {
		return result(input, "ORDER_PAYMENT_MISMATCH");
	}
	if (input.payment.vendorId !== input.order.vendorId) {
		return result(input, "ORDER_VENDOR_MISMATCH");
	}
	if (
		input.order.status !== OrderStatus.COMPLETED &&
		input.order.status !== OrderStatus.COMPLETED_BUYER_NO_SHOW
	) {
		return result(input, "ORDER_NOT_FINANCIALLY_COMPLETABLE");
	}

	const completion = input.trustedCompletion;
	if (!completion.trustedCompletionAt) {
		return result(input, "TRUSTED_COMPLETION_MISSING");
	}
	if (
		!completion.confirmationMethod ||
		!completion.confirmationReference?.trim() ||
		(completion.confirmationMethod === "SUPPORT" &&
			(!completion.confirmedBy ||
				!completion.confirmationReference.startsWith("admin-support:")))
	) {
		return result(input, "TRUSTED_COMPLETION_EVIDENCE_INVALID", {
			trustedCompletionAt: completion.trustedCompletionAt,
		});
	}
	if (completion.trustedCompletionAt.getTime() > input.now.getTime()) {
		return result(input, "TRUSTED_COMPLETION_IN_FUTURE", {
			trustedCompletionAt: completion.trustedCompletionAt,
		});
	}
	const payoutEligibleAt = new Date(
		completion.trustedCompletionAt.getTime() + PAYOUT_GRACE_PERIOD_MS,
	);
	const completionTimes = {
		trustedCompletionAt: completion.trustedCompletionAt,
		payoutEligibleAt,
	};
	if (input.activeDisputeIds.length > 0) {
		return result(input, "OPEN_DISPUTE", {
			...completionTimes,
			blockingReferenceIds: [...input.activeDisputeIds],
		});
	}
	if (input.refund) {
		return result(input, "REFUND_BLOCKING", {
			...completionTimes,
			blockingReferenceIds: [input.refund.id],
		});
	}
	if (input.payoutHold?.active) {
		return result(input, "PAYOUT_HOLD_ACTIVE", completionTimes);
	}
	if (!input.recipient) {
		return result(input, "RECIPIENT_MISSING", completionTimes);
	}
	if (input.recipient.vendorId !== input.order.vendorId) {
		return result(input, "RECIPIENT_VENDOR_MISMATCH", completionTimes);
	}
	if (input.recipient.status !== "ACTIVE") {
		return result(input, "RECIPIENT_NOT_ACTIVE", completionTimes);
	}
	if (!input.recipient.verifiedAt) {
		return result(input, "RECIPIENT_NOT_VERIFIED", completionTimes);
	}
	if (input.now.getTime() < payoutEligibleAt.getTime()) {
		return result(input, "GRACE_PERIOD_ACTIVE", completionTimes);
	}
	return result(input, "ELIGIBLE", completionTimes);
}
