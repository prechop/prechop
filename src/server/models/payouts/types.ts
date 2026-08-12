import type { PaymentSettlementMode } from "../enums";

export const PAYOUT_STATUSES = [
	"DRAFT",
	"QUEUED",
	"PROCESSING",
	"PAID",
	"FAILED",
	"CANCELLED",
	"HELD",
	"REVERSED",
] as const;

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export interface IPayoutRecipientSnapshot {
	recipientId: string;
	recipientVersion: number;
	paystackRecipientCode: string;
	bankCode: string;
	bankName: string;
	accountName: string;
	accountNumberLast4: string;
	verifiedAt: Date;
}

export interface IPayoutCreateInput {
	vendorId: string;
	settlementMode: PaymentSettlementMode;
	currency: "NGN";
	totalAmountKobo: number;
	transferFeeKobo: number;
	stampDutyKobo: number;
	recipientSnapshot: IPayoutRecipientSnapshot;
	idempotencyKey: string;
}

export interface IPayout extends IPayoutCreateInput {
	_id: string;
	id?: string;
	status: PayoutStatus;
	grossDebitKobo: number;
	paystackTransferReference?: string;
	paystackTransferCode?: string;
	queuedAt?: Date;
	submittedAt?: Date;
	paidAt?: Date;
	failedAt?: Date;
	cancelledAt?: Date;
	failureReason?: string;
	transferAttempts?: Array<{
		at: Date;
		reference: string;
		code?: string;
		providerStatus?: string;
	}>;
	createdAt: Date;
	updatedAt: Date;
}
