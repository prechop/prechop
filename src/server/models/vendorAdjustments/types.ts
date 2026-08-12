export const VENDOR_ADJUSTMENT_STATUSES = [
	"OPEN",
	"APPLIED",
	"WAIVED",
] as const;
export type VendorAdjustmentStatus =
	(typeof VENDOR_ADJUSTMENT_STATUSES)[number];

export interface IVendorAdjustment {
	_id: string;
	id?: string;
	vendorId: string;
	buyerOrderId: string;
	paymentId: string;
	refundId: string;
	amountKobo: number;
	type: "POST_PAYOUT_REFUND_DEBT";
	status: VendorAdjustmentStatus;
	reason: string;
	idempotencyKey: string;
	createdAt: Date;
	updatedAt: Date;
}
