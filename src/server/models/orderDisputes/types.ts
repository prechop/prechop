export const ORDER_DISPUTE_REASONS = [
	"FAILED_DELIVERY",
	"BUYER_NO_SHOW_COMPLAINT",
	"WRONG_ITEM",
	"MISSING_ITEM",
	"QUALITY_COMPLAINT",
	"NON_DELIVERY",
	"VENDOR_UNAVAILABLE",
	"REFUND_FAILURE",
] as const;

export type OrderDisputeReason = (typeof ORDER_DISPUTE_REASONS)[number];

export const ORDER_DISPUTE_STATUSES = [
	"OPEN",
	"MORE_EVIDENCE_REQUESTED",
	"RESOLVED",
] as const;

export type OrderDisputeStatus = (typeof ORDER_DISPUTE_STATUSES)[number];

export const ORDER_DISPUTE_ACTIONS = [
	"UPHOLD_COMPLETION",
	"ISSUE_FULL_REFUND",
	"ISSUE_PARTIAL_REFUND",
	"REJECT_DISPUTE",
	"REQUEST_MORE_EVIDENCE",
] as const;

export type OrderDisputeAction = (typeof ORDER_DISPUTE_ACTIONS)[number];

export interface IOrderDisputeEvidence {
	orderSnapshot?: Record<string, unknown>;
	menuSnapshot?: Record<string, unknown>;
	paymentRecord?: Record<string, unknown>;
	timeline?: unknown[];
	qrPinConfirmation?: Record<string, unknown>;
	messages?: unknown[];
	photos?: string[];
	vendorNotes?: string[];
	buyerNotes?: string[];
}

export interface IOrderDisputeCreateInput {
	buyerOrderId: string;
	buyerId: string;
	vendorId: string;
	reason: OrderDisputeReason;
	status?: OrderDisputeStatus;
	evidence: IOrderDisputeEvidence;
}

export interface IOrderDispute {
	_id: string;
	id?: string;
	buyerOrderId: string;
	buyerId: string;
	vendorId: string;
	reason: OrderDisputeReason;
	status: OrderDisputeStatus;
	evidence: IOrderDisputeEvidence;
	resolutionAction?: OrderDisputeAction;
	resolutionNote?: string;
	resolvedBy?: string;
	resolvedAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}
