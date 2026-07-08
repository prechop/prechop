export interface IRefundCreateInput {
	paymentId: string;
	amountKobo: number;
	reason: string;
	paystackRefundId?: string;
	processedAt?: Date;
}

export interface IRefund {
	_id: string;
	id?: string;
	paymentId: string;
	amountKobo: number;
	reason: string;
	paystackRefundId?: string;
	processedAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}
