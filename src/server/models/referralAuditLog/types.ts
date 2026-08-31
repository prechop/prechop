export type ReferralAuditOutcome =
	| "accepted"
	| "flagged_ip"
	| "flagged_device"
	| "rejected";

export interface IReferralAuditLog {
	_id: string;
	id?: string;
	vendorId: string;
	creatorUserId: string;
	referredUserId: string;
	buyerOrderId?: string;
	campaignId: string;
	outcome: ReferralAuditOutcome;
	reason?: string;
	ipHash: string;
	deviceId?: string;
	checkedAt: Date;
	createdAt: Date;
}

export interface IReferralAuditLogCreateInput {
	vendorId: string;
	creatorUserId: string;
	referredUserId: string;
	buyerOrderId?: string;
	campaignId: string;
	outcome: ReferralAuditOutcome;
	reason?: string;
	ipHash: string;
	deviceId?: string;
	checkedAt?: Date;
}
