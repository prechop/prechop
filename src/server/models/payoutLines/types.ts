import type { PaymentSettlementMode } from "../enums";

export interface IPayoutLineCreateInput {
	payoutId: string;
	vendorPayableId: string;
	buyerOrderId: string;
	paymentId: string;
	vendorId: string;
	settlementMode: PaymentSettlementMode;
	amountKobo: number;
	idempotencyKey: string;
}

export interface IPayoutLine extends IPayoutLineCreateInput {
	_id: string;
	id?: string;
	createdAt: Date;
	updatedAt: Date;
}
