export interface IAnalyticsSnapshotCreateInput {
	vendorId: string;
	date: Date;
	totalOrders?: number;
	completedOrders?: number;
	cancelledOrders?: number;
	totalRevenueKobo?: number;
	avgOrderValueKobo?: number;
	topItemIds?: string[];
	peakHour?: number;
	newReviewCount?: number;
	avgRatingForDay?: number;
}

/** Mutable metric fields for an existing snapshot (identity keys excluded). */
export type IAnalyticsSnapshotPayload = Partial<
	Omit<IAnalyticsSnapshotCreateInput, "vendorId" | "date">
>;

export interface IAnalyticsSnapshot {
	_id: string;
	id?: string;
	vendorId: string;
	date: Date;
	totalOrders: number;
	completedOrders: number;
	cancelledOrders: number;
	totalRevenueKobo: number;
	avgOrderValueKobo: number;
	topItemIds: string[];
	peakHour?: number;
	newReviewCount: number;
	avgRatingForDay?: number;
	createdAt: Date;
	updatedAt: Date;
}
