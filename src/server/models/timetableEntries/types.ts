import type { DayOfWeek } from "../enums";

export interface ITimetableEntryCreateInput {
	vendorId: string;
	menuItemId: string;
	dayOfWeek: DayOfWeek;
	isOpen?: boolean;
	orderStartTime?: string;
	cutoffTime?: string;
	cookingStartTime?: string;
	readyDeliveryStartTime?: string;
	plannedMenu?: string;
}

export interface ITimetableEntry {
	_id: string;
	id?: string;
	vendorId: string;
	menuItemId: string;
	dayOfWeek: DayOfWeek;
	isOpen: boolean;
	orderStartTime?: string;
	cutoffTime?: string;
	cookingStartTime?: string;
	readyDeliveryStartTime?: string;
	plannedMenu?: string;
	createdAt: Date;
	updatedAt: Date;
}
