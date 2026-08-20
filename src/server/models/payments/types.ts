import type { PaymentSettlementMode, PaymentStatus } from "../enums";

export interface IPaymentCreateInput {
	buyerOrderId: string;
	buyerId: string;
	vendorId: string;
	paystackRef: string;
	paystackAccessCode?: string;
	paystackAuthorizationUrl?: string;
	externalPaymentTokenHash?: string;
	externalPaymentExpiresAt?: Date;
	amountKobo: number;
	platformFeeKobo: number;
	foodSubtotalKobo?: number;
	deliveryFeeKobo?: number;
	paymentProcessingFeeKobo?: number;
	prechopCommissionKobo?: number;
	vendorAmountKobo: number;
	vendorSettlementKobo?: number;
	idempotencyKey: string;
	status?: PaymentStatus;
	settlementMode?: PaymentSettlementMode;
	migrationModeAtCreation?: string;
	migrationConfigVersion?: number;
	pilotMatched?: boolean;
}

export interface IPayment {
	_id: string;
	id?: string;
	buyerOrderId: string;
	buyerId: string;
	vendorId: string;
	paystackRef: string;
	paystackAccessCode?: string;
	paystackAuthorizationUrl?: string;
	externalPaymentTokenHash?: string;
	externalPaymentExpiresAt?: Date;
	amountKobo: number;
	platformFeeKobo: number;
	foodSubtotalKobo?: number;
	deliveryFeeKobo?: number;
	paymentProcessingFeeKobo?: number;
	prechopCommissionKobo?: number;
	vendorAmountKobo: number;
	vendorSettlementKobo?: number;
	status: PaymentStatus;
	settlementMode: PaymentSettlementMode;
	migrationModeAtCreation: string;
	migrationConfigVersion: number;
	pilotMatched: boolean;
	channel?: string;
	paidAt?: Date;
	webhookVerified: boolean;
	idempotencyKey: string;
	createdAt: Date;
	updatedAt: Date;
}
