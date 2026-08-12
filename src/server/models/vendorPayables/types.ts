import type { PaymentSettlementMode } from "../enums";

export const VENDOR_PAYABLE_STATUSES = [
	"GRACE_PERIOD",
	"ELIGIBLE",
	"HELD",
	"QUEUED",
	"PROCESSING",
	"PAID",
	"CANCELLED",
	"VENDOR_DEBT",
] as const;

export type VendorPayableStatus = (typeof VENDOR_PAYABLE_STATUSES)[number];

export const PAYOUT_HOLD_REASON_CODES = [
	"ORDER_REVIEW",
	"BUYER_NO_SHOW",
	"FAILED_DELIVERY",
	"OPEN_DISPUTE",
	"REFUND_PENDING",
	"REFUND_FAILED",
	"BANK_ACCOUNT_REVIEW",
	"FRAUD_REVIEW",
	"LEGAL_RESTRICTION",
	"ADMIN_OTHER",
] as const;

export type PayoutHoldReasonCode = (typeof PAYOUT_HOLD_REASON_CODES)[number];

export interface IVendorPayableEligibilityEvidence {
	confirmationMethod: "QR" | "PIN" | "SUPPORT";
	confirmationReference?: string;
	confirmedBy?: string;
	paymentVerifiedAt: Date;
	evaluatedAt: Date;
	evaluatorVersion: string;
}

export interface IVendorPayableHold {
	active: boolean;
	reasonCode?: PayoutHoldReasonCode;
	note?: string;
	heldAt?: Date;
	heldBy?: string;
	releasedAt?: Date;
	releasedBy?: string;
}

export interface IVendorPayableCreateInput {
	buyerOrderId: string;
	paymentId: string;
	vendorId: string;
	amountKobo: number;
	settlementMode: PaymentSettlementMode;
	trustedCompletionAt: Date;
	payoutEligibleAt: Date;
	eligibilityEvidence: IVendorPayableEligibilityEvidence;
	idempotencyKey: string;
	linkedDisputeIds?: string[];
	linkedRefundId?: string;
	initialStatus?: VendorPayableStatus;
	initialHold?: IVendorPayableHold;
}

export interface IVendorPayable extends IVendorPayableCreateInput {
	_id: string;
	id?: string;
	status: VendorPayableStatus;
	payoutId?: string;
	hold: IVendorPayableHold;
	eligibleAt: Date;
	queuedAt?: Date;
	processingAt?: Date;
	paidAt?: Date;
	cancelledAt?: Date;
	debtRecordedAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}
