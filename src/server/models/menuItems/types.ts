import type { MenuCategory } from "../enums";

export interface IMenuItemCreateInput {
	vendorId: string;
	campusId: string;
	category: MenuCategory;
	name: string;
	priceKobo: number;
	description?: string;
	imageUrl?: string;
	estimatedPrepMin?: number;
	displayOrder?: number;
}

export interface IMenuItem {
	_id: string;
	id?: string;
	vendorId: string;
	campusId: string;
	category: MenuCategory;
	name: string;
	description?: string;
	priceKobo: number;
	imageUrl?: string;
	estimatedPrepMin: number;
	isAvailable: boolean;
	isSoldOut: boolean;
	displayOrder: number;
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
}
