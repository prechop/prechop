export interface IDeliveryCodeCounter {
	_id: string;
	id?: string;
	vendorId: string;
	nextSequence: number;
	createdAt: Date;
	updatedAt: Date;
}
