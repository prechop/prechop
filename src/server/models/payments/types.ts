import type { PaymentStatus } from "../enums";

export interface IPaymentCreateInput {
	buyerOrderId: string;
	buyerId: string;
	vendorId: string;
	paystackRef: string;
	paystackAccessCode?: string;
	amountKobo: number;
	platformFeeKobo: number;
	vendorAmountKobo: number;
	idempotencyKey: string;
}

export interface IPayment {
	_id: string;
	id?: string;
	buyerOrderId: string;
	buyerId: string;
	vendorId: string;
	paystackRef: string;
	paystackAccessCode?: string;
	amountKobo: number;
	platformFeeKobo: number;
	vendorAmountKobo: number;
	status: PaymentStatus;
	channel?: string;
	paidAt?: Date;
	webhookVerified: boolean;
	idempotencyKey: string;
	createdAt: Date;
	updatedAt: Date;
}
