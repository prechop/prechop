export interface IAuditLogCreateInput {
	userId?: string;
	role?: string;
	action: string;
	resourceType: string;
	resourceId?: string;
	previousState?: Record<string, unknown>;
	newState?: Record<string, unknown>;
	ipAddress?: string;
	userAgent?: string;
}

export interface IAuditLog {
	_id: string;
	id?: string;
	userId?: string;
	role?: string;
	action: string;
	resourceType: string;
	resourceId?: string;
	previousState?: Record<string, unknown>;
	newState?: Record<string, unknown>;
	ipAddress?: string;
	userAgent?: string;
	createdAt: Date;
	updatedAt: Date;
}
