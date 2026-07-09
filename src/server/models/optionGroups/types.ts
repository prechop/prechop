export interface IMenuOption {
	_id?: string;
	id?: string;
	name: string;
	priceKobo: number;
	displayOrder: number;
}

export interface IMenuOptionInput {
	name: string;
	priceKobo: number;
	displayOrder?: number;
}

export interface IOptionGroupCreateInput {
	vendorId: string;
	campusId: string;
	name: string;
	required?: boolean;
	minSelect?: number;
	// null / undefined = unlimited
	maxSelect?: number | null;
	displayOrder?: number;
	options: IMenuOptionInput[];
}

export interface IOptionGroupUpdateInput {
	name?: string;
	required?: boolean;
	minSelect?: number;
	maxSelect?: number | null;
	displayOrder?: number;
	options?: IMenuOptionInput[];
}

export interface IOptionGroup {
	_id: string;
	id?: string;
	vendorId: string;
	campusId: string;
	name: string;
	required: boolean;
	minSelect: number;
	maxSelect: number | null;
	displayOrder: number;
	options: IMenuOption[];
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
}
