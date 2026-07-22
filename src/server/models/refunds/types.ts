export type RefundStatus =
	| "REFUND_PENDING"
	| "REFUND_PROCESSING"
	| "REFUNDED"
	| "REFUND_FAILED";

export interface IRefundCreateInput {
	paymentId: string;
	amountKobo: number;
	reason: string;
	status?: RefundStatus;
	paystackRefundId?: string;
	processedAt?: Date;
	failedAt?: Date;
	failureReason?: string;
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
	createdAt: Date;
	updatedAt: Date;
}
