export const VENDOR_TRANSFER_RECIPIENT_STATUSES = [
	"ACTIVE",
	"RETIRED",
] as const;

export type VendorTransferRecipientStatus =
	(typeof VENDOR_TRANSFER_RECIPIENT_STATUSES)[number];

export interface IRecipientAuditEntry {
	at: Date;
	action: "CREATED" | "VERIFIED" | "ACTIVATED" | "RETIRED";
	actorId?: string;
	note?: string;
}

export interface IVendorTransferRecipientCreateInput {
	vendorId: string;
	version: number;
	paystackRecipientCode: string;
	bankCode: string;
	bankName: string;
	accountName: string;
	accountNumberEncrypted: string;
	accountNumberLast4: string;
	verifiedAt: Date;
	verifiedBy?: string;
	idempotencyKey: string;
}

export interface IVendorTransferRecipient
	extends IVendorTransferRecipientCreateInput {
	_id: string;
	id?: string;
	status: VendorTransferRecipientStatus;
	retiredAt?: Date;
	retiredBy?: string;
	auditHistory: IRecipientAuditEntry[];
	createdAt: Date;
	updatedAt: Date;
}
