import type { MealTime } from "../enums";

export interface IDeliveryWindowCreateInput {
	vendorId: string;
	name?: string;
	mealTime: MealTime;
	orderWindowStart: string;
	orderWindowEnd: string;
	deliveryWindowStart: string;
	deliveryWindowEnd: string;
	capacity: number;
	active?: boolean;
}

export interface IDeliveryWindow {
	_id: string;
	id?: string;
	vendorId: string;
	name?: string;
	mealTime: MealTime;
	orderWindowStart: string;
	orderWindowEnd: string;
	deliveryWindowStart: string;
	deliveryWindowEnd: string;
	capacity: number;
	active: boolean;
	createdAt: Date;
	updatedAt: Date;
}
