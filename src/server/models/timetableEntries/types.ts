import type { DayOfWeek } from "../enums";

export interface ITimetableEntryCreateInput {
	vendorId: string;
	menuItemId: string;
	dayOfWeek: DayOfWeek;
	isOpen?: boolean;
	plannedMenu?: string;
}

export interface ITimetableEntry {
	_id: string;
	id?: string;
	vendorId: string;
	menuItemId: string;
	dayOfWeek: DayOfWeek;
	isOpen: boolean;
	plannedMenu?: string;
	createdAt: Date;
	updatedAt: Date;
}
