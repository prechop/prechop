import type { FulfillmentType, OrderStatus } from "../enums";

/**
 * PDF receipt generation state.
 *
 * FAILED is a first-class terminal state, not an omission: receipt rendering
 * happens out of band (S3 + Resend) after the order completes, so "we tried and
 * could not" is a real outcome the buyer must be shown — otherwise a failed
 * render is indistinguishable from a slow one and the UI spins on PENDING
 * forever.
 */
export type ReceiptStatus = "PENDING" | "READY" | "FAILED";

export const RECEIPT_STATUSES: readonly ReceiptStatus[] = [
	"PENDING",
	"READY",
	"FAILED",
] as const;

export interface IBuyerOrderItemSelectedOption {
	dailyOrderOptionId?: string;
	groupName: string;
	snapshotName: string;
	snapshotPriceKobo: number;
	quantity: number;
	subtotalKobo: number;
}

export interface IBuyerOrderItem {
	dailyOrderItemId: string;
	menuItemId: string;
	snapshotName: string;
	snapshotPriceKobo: number;
	quantity: number;
	subtotalKobo: number;
	selectedOptions: IBuyerOrderItemSelectedOption[];
}

export interface IBuyerOrderTimelineEntry {
	at: Date;
	type: string;
	actor?: "buyer" | "vendor" | "system" | "admin";
	actorId?: string;
	note?: string;
	data?: Record<string, unknown>;
}

export interface IBuyerOrderCreateInput {
	orderNumber: string;
	dailyOrderId: string;
	vendorId: string;
	buyerId: string;
	campusId: string;
	status?: OrderStatus;
	fulfillmentType: FulfillmentType;
	deliveryHostelName?: string;
	deliveryRoomNumber?: string;
	deliveryAdditionalInfo?: string;
	deliveryFullAddress?: string;
	deliveryPhone?: string;
	customerMessage?: string;
	subtotalKobo: number;
	deliveryFeeKobo: number;
	platformFeeKobo: number;
	paymentProcessingFeeKobo?: number;
	prechopCommissionKobo?: number;
	vendorFoodAmountKobo?: number;
	vendorDeliveryAmountKobo?: number;
	vendorSettlementKobo?: number;
	totalKobo: number;
	items: IBuyerOrderItem[];
}

export interface IBuyerOrder {
	_id: string;
	id?: string;
	orderNumber: string;
	dailyOrderId: string;
	vendorId: string;
	buyerId: string;
	campusId: string;
	status: OrderStatus;
	fulfillmentType: FulfillmentType;
	deliveryHostelName?: string;
	deliveryRoomNumber?: string;
	deliveryAdditionalInfo?: string;
	deliveryFullAddress?: string;
	deliveryPhone?: string;
	customerMessage?: string;
	subtotalKobo: number;
	deliveryFeeKobo: number;
	platformFeeKobo: number;
	paymentProcessingFeeKobo?: number;
	prechopCommissionKobo?: number;
	vendorFoodAmountKobo?: number;
	vendorDeliveryAmountKobo?: number;
	vendorSettlementKobo?: number;
	totalKobo: number;
	cancellationReason?: string;
	cancelledBy?: "buyer" | "vendor" | "system";
	paidAt?: Date;
	acceptedAt?: Date;
	acceptanceDeadline?: Date;
	vendorAcceptanceReminder5SentAt?: Date;
	vendorAcceptanceWarning8SentAt?: Date;
	vendorRejectedAt?: Date;
	refundPendingAt?: Date;
	refundProcessingAt?: Date;
	refundFailedAt?: Date;
	refundFailureReason?: string;
	vendorNoResponseExpiredAt?: Date;
	readyAt?: Date;
	pickupReminder60SentAt?: Date;
	pickupWarning90SentAt?: Date;
	pickupNoShowReportableAt?: Date;
	pickupNoShowReportedAt?: Date;
	pickupBuyerResponseDeadline?: Date;
	pickupBuyerRespondedAt?: Date;
	pickupProblemReportedAt?: Date;
	pickupProblemNote?: string;
	deliveryStartedAt?: Date;
	deliveryBuyerUnreachableReportedAt?: Date;
	deliveryBuyerResponseDeadline?: Date;
	deliveryFailedAt?: Date;
	deliveryArrivalTime?: Date;
	deliveryContactAttempts?: number;
	deliveryFailureNote?: string;
	deliveryEvidencePhotoUrl?: string;
	adminReviewRequiredAt?: Date;
	adminReviewReason?: string;
	pickedUpAt?: Date;
	deliveredAt?: Date;
	confirmedAt?: Date;
	confirmedBy?: string;
	confirmationMethod?: "QR" | "PIN" | "SUPPORT";
	confirmationVendorId?: string;
	confirmationBuyerId?: string;
	confirmationOrderId?: string;
	handoverTokenHash?: string;
	handoverPinHash?: string;
	handoverCredentialCreatedAt?: Date;
	handoverCredentialUsedAt?: Date;
	handoverFailedAttempts?: number;
	handoverLockedUntil?: Date;
	channel?: string;
	receiptUrl?: string;
	/**
	 * Lifecycle of the emailed/downloadable PDF receipt (PRD §8.13).
	 *
	 * Distinct from `receiptUrl`, which is NOT a receipt-generation field at
	 * all: it holds the public `/receipt/{token}` link the "Pay for Me" flow
	 * looks orders up by (and is indexed for exactly that lookup). Overloading
	 * it would break that flow.
	 *
	 * Undefined means "placed before this field shipped" — the UI must render
	 * nothing rather than promise a receipt that will never generate. That is
	 * why there is no default: a default would retroactively claim every
	 * historical order has a receipt pending.
	 */
	receiptStatus?: ReceiptStatus;
	timeline?: IBuyerOrderTimelineEntry[];
	items: IBuyerOrderItem[];
	createdAt: Date;
	updatedAt: Date;
}
