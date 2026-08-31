export interface IReferral {
	_id: string;
	id?: string;
	vendorId: string;
	creatorUserId: string;
	referredUserId: string;
	buyerOrderId: string;
	campaignId: string;
	creditedAt: Date;
	ipHash: string;
	deviceId?: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface IReferralCreateInput {
	vendorId: string;
	creatorUserId: string;
	referredUserId: string;
	buyerOrderId: string;
	campaignId: string;
	ipHash: string;
	deviceId?: string;
}
