export type RefundStatus =
	| "REFUND_PENDING"
	| "REFUND_PROCESSING"
	| "REFUND_NEEDS_ATTENTION"
	| "REFUNDED"
	| "REFUND_FAILED";

export interface IRefundAttempt {
	at: Date;
	kind: "INITIAL" | "RETRY";
	outcome: "ACCEPTED" | "FAILED" | "DISCOVERED";
	paystackRefundId?: string;
	paystackStatus?: string;
	error?: string;
}

export interface IRefundCreateInput {
	paymentId: string;
	amountKobo: number;
	reason: string;
	status?: RefundStatus;
	paystackRefundId?: string;
	processedAt?: Date;
	failedAt?: Date;
	failureReason?: string;
	paystackStatus?: string;
	expectedAt?: Date;
	submittedAt?: Date;
	needsAttentionAt?: Date;
	lastReconciledAt?: Date;
	submissionAttempts?: number;
	attempts?: IRefundAttempt[];
}

export interface IRefund {
	_id: string;
	id?: string;
	paymentId: string;
	amountKobo: number;
	reason: string;
	status?: RefundStatus;
	paystackRefundId?: string;
	processedAt?: Date;
	failedAt?: Date;
	failureReason?: string;
	paystackStatus?: string;
	expectedAt?: Date;
	submittedAt?: Date;
	needsAttentionAt?: Date;
	lastReconciledAt?: Date;
	submissionAttempts?: number;
	attempts?: IRefundAttempt[];
	createdAt: Date;
	updatedAt: Date;
}
