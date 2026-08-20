export interface IStickerBatch {
	_id: string;
	id?: string;
	vendorId: string;
	batchLabel: string;
	startCode: string;
	endCode: string;
	startSequence: number;
	endSequence: number;
	quantity: number;
	status: "ACTIVE" | "EXHAUSTED";
	notes?: string;
	printedAt?: Date;
	shippedAt?: Date;
	completedAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}

export interface IStickerBatchCreateInput {
	vendorId: string;
	batchLabel: string;
	startCode: string;
	endCode: string;
	startSequence: number;
	endSequence: number;
	status?: "ACTIVE" | "EXHAUSTED";
	notes?: string;
	printedAt?: string;
	shippedAt?: string;
}
