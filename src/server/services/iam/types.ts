/** The actor performing an IAM mutation, for auditing & self-lockout guards. */
export interface IamActor {
	userId: string;
	/** Group-name snapshot, stored in the audit `role` field. */
	groups?: string[];
	ip?: string;
	userAgent?: string;
}

export function actorLabel(actor: IamActor): string {
	return actor.groups?.join(",") ?? "";
}
