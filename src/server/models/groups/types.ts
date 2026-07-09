export interface IGroupCreateInput {
	name: string;
	description?: string;
	policyIds?: string[];
	isBuiltIn?: boolean;
}

export interface IGroup {
	_id: string;
	id?: string;
	name: string;
	description?: string;
	policyIds: string[];
	isBuiltIn: boolean;
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
}
