export type PolicyEffect = "Allow" | "Deny";

export interface IPolicyStatement {
	effect: PolicyEffect;
	/** Action strings from the permission catalog. `*` and `resource:*` allowed. */
	actions: string[];
	/** Optional resource matchers. Absent = all resources. */
	resources?: string[];
	/** Optional equality conditions, e.g. `{ campusId: "$user.campusId" }`. */
	condition?: Record<string, string>;
}

export interface IPolicyCreateInput {
	name: string;
	description?: string;
	statements: IPolicyStatement[];
	isBuiltIn?: boolean;
}

export interface IPolicy {
	_id: string;
	id?: string;
	name: string;
	description?: string;
	statements: IPolicyStatement[];
	isBuiltIn: boolean;
	deleted: boolean;
	createdAt: Date;
	updatedAt: Date;
}
