import type { DailyOrderStatus } from "../enums";

export interface IDailyOrderOption {
	_id?: string;
	id?: string;
	name: string;
	priceKobo: number;
	displayOrder: number;
}

export interface IDailyOrderOptionGroup {
	_id?: string;
	id?: string;
	sourceGroupId?: string | null;
	name: string;
	required: boolean;
	minSelect: number;
	maxSelect: number | null;
	options: IDailyOrderOption[];
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
	optionGroups: IDailyOrderOptionGroup[];
}

export interface IDailyOrderOptionGroupInput {
	sourceGroupId?: string | null;
	name: string;
	required?: boolean;
	minSelect?: number;
	maxSelect?: number | null;
	options: Array<{ name: string; priceKobo: number; displayOrder?: number }>;
}

export interface IDailyOrderItemInput {
	menuItemId: string;
	snapshotName: string;
	snapshotPriceKobo: number;
	snapshotImageUrl?: string;
	snapshotPrepMin: number;
	maxQuantity?: number | null;
	optionGroups?: IDailyOrderOptionGroupInput[];
}

export interface IDailyOrderCreateInput {
	vendorId: string;
	campusId: string;
	shareableToken: string;
	title: string;
	scheduledDate: Date;
	// Ordering opens at this time; before it the listing shows as "coming soon"
	// and cannot be ordered. Defaults to creation time (orderable immediately).
	availableFrom?: Date;
	cutoffTime: Date;
	isPublic?: boolean;
	pickupAvailable?: boolean;
	deliveryAvailable?: boolean;
	deliveryFeeKobo?: number;
	deliveryCoverage?: string;
	deliveryEstimateMinutes?: number;
	deliveryContactPhone?: string;
	deliveryResponsibilityAccepted?: boolean;
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
	availableFrom?: Date;
	cutoffTime: Date;
	status: DailyOrderStatus;
	isPublic: boolean;
	pickupAvailable: boolean;
	deliveryAvailable: boolean;
	deliveryFeeKobo: number;
	deliveryCoverage?: string;
	deliveryEstimateMinutes?: number;
	deliveryContactPhone?: string;
	deliveryResponsibilityAccepted?: boolean;
	totalOrdersCount: number;
	items: IDailyOrderItem[];
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
}
