export interface IFulfillmentLocation {
	_id: string;
	id?: string;
	name: string;
	state?: string;
	city?: string;
	campusOrSchool?: string;
	address?: string;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface IFulfillmentLocationCreateInput {
	name: string;
	state?: string;
	city?: string;
	campusOrSchool?: string;
	address?: string;
	isActive?: boolean;
}
