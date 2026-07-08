export interface ICampusCreateInput {
	name: string;
	shortCode: string;
	state: string;
	isActive?: boolean;
}

export interface ICampus {
	_id: string;
	id?: string;
	name: string;
	shortCode: string;
	state: string;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}
