import { ErrOrderNotFound } from "../../constants";
import {
	getBuyerOrderByIdDB,
	listBuyerOrdersDB,
	type OrderStatus,
} from "../../models";

export function listOrders({
	status,
	limit,
	offset,
}: {
	status?: OrderStatus;
	limit?: number;
	offset?: number;
}) {
	const filter: Record<string, unknown> = {};
	if (status) filter.status = status;
	return listBuyerOrdersDB({ filter, limit, offset });
}

export async function getOrder(id: string) {
	const order = await getBuyerOrderByIdDB({ id });
	if (!order) throw ErrOrderNotFound;
	return order;
}
