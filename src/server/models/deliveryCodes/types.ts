export interface IDeliveryCode {
	_id: string;
	id?: string;
	vendorId: string;
	code: string;
	sequence: number;
	assignedOrderId?: string;
	assignedAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}

export interface IDeliveryCodeCreateInput {
	vendorId: string;
	code: string;
	sequence: number;
	assignedOrderId?: string;
	assignedAt?: Date;
}
