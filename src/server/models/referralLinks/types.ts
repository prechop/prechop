export interface IReferralLink {
	_id: string;
	id?: string;
	vendorId: string;
	creatorUserId: string;
	token: string;
	createdAt: Date;
}

export interface IReferralLinkCreateInput {
	vendorId: string;
	creatorUserId: string;
	token: string;
}
