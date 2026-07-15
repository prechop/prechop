import type { FulfillmentType, OrderStatus } from "../enums";

export interface IBuyerOrderItemSelectedOption {
	dailyOrderOptionId?: string;
	groupName: string;
	snapshotName: string;
	snapshotPriceKobo: number;
	quantity: number;
	subtotalKobo: number;
}

export interface IBuyerOrderItem {
	dailyOrderItemId: string;
	menuItemId: string;
	snapshotName: string;
	snapshotPriceKobo: number;
	quantity: number;
	subtotalKobo: number;
	selectedOptions: IBuyerOrderItemSelectedOption[];
}

export interface IBuyerOrderCreateInput {
	orderNumber: string;
	dailyOrderId: string;
	vendorId: string;
	buyerId: string;
	campusId: string;
	status?: OrderStatus;
	fulfillmentType: FulfillmentType;
	deliveryHostelName?: string;
	deliveryRoomNumber?: string;
	deliveryAdditionalInfo?: string;
	deliveryFullAddress?: string;
	subtotalKobo: number;
	deliveryFeeKobo: number;
	platformFeeKobo: number;
	paymentProcessingFeeKobo?: number;
	prechopCommissionKobo?: number;
	vendorFoodAmountKobo?: number;
	vendorDeliveryAmountKobo?: number;
	vendorSettlementKobo?: number;
	totalKobo: number;
	items: IBuyerOrderItem[];
}

export interface IBuyerOrder {
	_id: string;
	id?: string;
	orderNumber: string;
	dailyOrderId: string;
	vendorId: string;
	buyerId: string;
	campusId: string;
	status: OrderStatus;
	fulfillmentType: FulfillmentType;
	deliveryHostelName?: string;
	deliveryRoomNumber?: string;
	deliveryAdditionalInfo?: string;
	deliveryFullAddress?: string;
	subtotalKobo: number;
	deliveryFeeKobo: number;
	platformFeeKobo: number;
	paymentProcessingFeeKobo?: number;
	prechopCommissionKobo?: number;
	vendorFoodAmountKobo?: number;
	vendorDeliveryAmountKobo?: number;
	vendorSettlementKobo?: number;
	totalKobo: number;
	cancellationReason?: string;
	cancelledBy?: "buyer" | "vendor" | "system";
	paidAt?: Date;
	channel?: string;
	receiptUrl?: string;
	items: IBuyerOrderItem[];
	createdAt: Date;
	updatedAt: Date;
}
