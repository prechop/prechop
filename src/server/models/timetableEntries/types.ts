import type { DayOfWeek } from "../enums";

export interface ITimetableEntryCreateInput {
	vendorId: string;
	menuItemId: string;
	dayOfWeek: DayOfWeek;
	isOpen?: boolean;
}

export interface ITimetableEntry {
	_id: string;
	id?: string;
	vendorId: string;
	menuItemId: string;
	dayOfWeek: DayOfWeek;
	isOpen: boolean;
	createdAt: Date;
	updatedAt: Date;
}
