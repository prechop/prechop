import type { DailyOrderStatus } from "../enums";

export interface IDailyOrderItemAddon {
	_id?: string;
	id?: string;
	name: string;
	priceKobo: number;
	displayOrder: number;
}

export interface IDailyOrderItem {
	_id?: string;
	id?: string;
	menuItemId: string;
	snapshotName: string;
	snapshotPriceKobo: number;
	snapshotImageUrl?: string;
	snapshotPrepMin: number;
	// null / undefined = unlimited
	maxQuantity?: number | null;
	orderedQuantity: number;
	addons: IDailyOrderItemAddon[];
}

export interface IDailyOrderItemInput {
	menuItemId: string;
	snapshotName: string;
	snapshotPriceKobo: number;
	snapshotImageUrl?: string;
	snapshotPrepMin: number;
	maxQuantity?: number | null;
	addons?: Array<{ name: string; priceKobo: number; displayOrder?: number }>;
}

export interface IDailyOrderCreateInput {
	vendorId: string;
	campusId: string;
	shareableToken: string;
	title: string;
	scheduledDate: Date;
	cutoffTime: Date;
	isPublic?: boolean;
	pickupAvailable?: boolean;
	deliveryAvailable?: boolean;
	deliveryFeeKobo?: number;
	items: IDailyOrderItemInput[];
}

export interface IDailyOrder {
	_id: string;
	id?: string;
	vendorId: string;
	campusId: string;
	shareableToken: string;
	title: string;
	scheduledDate: Date;
	cutoffTime: Date;
	status: DailyOrderStatus;
	isPublic: boolean;
	pickupAvailable: boolean;
	deliveryAvailable: boolean;
	deliveryFeeKobo: number;
	totalOrdersCount: number;
	items: IDailyOrderItem[];
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
}
