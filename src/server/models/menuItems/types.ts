import type { MenuCategory } from "../enums";

export interface IMenuItemCreateInput {
	vendorId: string;
	campusId: string;
	category: MenuCategory;
	name: string;
	priceKobo: number;
	variants?: IMenuItemVariantInput[];
	description?: string;
	imageUrl?: string;
	estimatedPrepMin?: number;
	displayOrder?: number;
	optionGroupIds?: string[];
}

export interface IMenuItemVariantInput {
	name: string;
	priceKobo: number;
	isDefault?: boolean;
	isActive?: boolean;
	displayOrder?: number;
}

export interface IMenuItemVariant {
	_id?: string;
	id?: string;
	name: string;
	priceKobo: number;
	isDefault: boolean;
	isActive: boolean;
	displayOrder: number;
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
	variants: IMenuItemVariant[];
	imageUrl?: string;
	estimatedPrepMin: number;
	isAvailable: boolean;
	isSoldOut: boolean;
	displayOrder: number;
	optionGroupIds: string[];
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
}
