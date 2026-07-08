import { createAuditLogDB } from "../../models";

export interface AuditInput {
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

/**
 * Fire-and-forget audit write. Never awaited on the request path and never
 * throws — an audit failure must not fail the action being audited.
 */
export function recordAudit(input: AuditInput): void {
	createAuditLogDB({ payload: input }).catch((error) => {
		console.error("[audit] failed to record audit log:", error);
	});
}

/** Awaitable variant for scripts/tests that need the write to complete. */
export async function recordAuditSync(input: AuditInput): Promise<void> {
	try {
		await createAuditLogDB({ payload: input });
	} catch (error) {
		console.error("[audit] failed to record audit log:", error);
	}
}
