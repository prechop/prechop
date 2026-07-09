import { listPaymentsDB } from "../../models";

export async function listAdminPayments({
	status,
	page = 1,
	pageSize = 50,
}: {
	status?: string;
	page?: number;
	pageSize?: number;
}) {
	const p = Math.max(1, page);
	const size = Math.min(100, Math.max(1, pageSize));
	const { payments, total } = await listPaymentsDB({
		status,
		skip: (p - 1) * size,
		limit: size,
	});
	return { payments, total, page: p };
}
