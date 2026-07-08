export interface IReviewCreateInput {
	buyerOrderId: string;
	vendorId: string;
	buyerId: string;
	rating: number;
	comment?: string;
	tags?: string[];
}

export interface IReview {
	_id: string;
	id?: string;
	buyerOrderId: string;
	vendorId: string;
	buyerId: string;
	rating: number;
	comment?: string;
	tags: string[];
	isFlagged: boolean;
	createdAt: Date;
	updatedAt: Date;
}
