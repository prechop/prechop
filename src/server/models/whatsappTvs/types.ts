export interface IWhatsappTvCreateInput {
	campusId: string;
	name: string;
	// Plaintext Nigerian MSISDN (234XXXXXXXXXX). Normalized, validated and
	// encrypted by the create fn before persisting. Never store plaintext.
	whatsappNumber: string;
	audienceSize?: number;
	priceRange?: string;
	displayOrder?: number;
}

export interface IWhatsappTv {
	_id: string;
	id?: string;
	campusId: string;
	name: string;
	// AES-256-GCM ciphertext. Decrypt with `constants/crypto.decrypt` only when
	// broadcasting to the number.
	whatsappNumber: string;
	audienceSize: number;
	priceRange?: string;
	isActive: boolean;
	displayOrder: number;
	createdAt: Date;
	updatedAt: Date;
}
