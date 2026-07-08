import { ErrDailyOrderNotFound, ErrForbidden } from "../../constants";
import {
	type DailyOrderStatus,
	getDailyOrderByIdDB,
	getDailyOrderByTokenDB,
	getVendorProfileByUserIdDB,
	listActiveDailyOrdersByCampusDB,
	listDailyOrdersByVendorDB,
} from "../../models";

export function getMarketplace({
	campusId,
	limit,
	offset,
}: {
	campusId: string;
	limit?: number;
	offset?: number;
}) {
	return listActiveDailyOrdersByCampusDB({ campusId, limit, offset });
}

export async function getPublicDailyOrder({
	shareableToken,
}: {
	shareableToken: string;
}) {
	const order = await getDailyOrderByTokenDB({ shareableToken });
	if (!order) throw ErrDailyOrderNotFound;
	return order;
}

export async function getMyDailyOrders({
	userId,
	status,
	limit,
	offset,
}: {
	userId: string;
	status?: DailyOrderStatus;
	limit?: number;
	offset?: number;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrForbidden;
	return listDailyOrdersByVendorDB({
		vendorId: vendor._id.toString(),
		status,
		limit,
		offset,
	});
}

export async function getMyDailyOrderById({
	userId,
	orderId,
}: {
	userId: string;
	orderId: string;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrForbidden;

	const order = await getDailyOrderByIdDB({ id: orderId });
	if (!order) throw ErrDailyOrderNotFound;
	if (order.vendorId.toString() !== vendor._id.toString()) throw ErrForbidden;
	return order;
}
