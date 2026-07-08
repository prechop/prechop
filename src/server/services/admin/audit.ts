import { listAuditLogsDB } from "../../models";

export function listAudit({
	limit,
	offset,
}: {
	limit?: number;
	offset?: number;
}) {
	return listAuditLogsDB({ limit, offset });
}
