import { ErrDailyOrderNotFound, ErrForbidden } from "../../constants";
import {
	DailyOrderStatus,
	getDailyOrderByIdDB,
	getVendorProfileByUserIdDB,
	setDailyOrderStatusDB,
} from "../../models";
import { refundOrdersForDailyOrder } from "../buyerOrders";

export async function closeDailyOrder({
	userId,
	orderId,
}: {
	userId: string;
	orderId: string;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrForbidden;

	const ok = await setDailyOrderStatusDB({
		id: orderId,
		vendorId: vendor._id.toString(),
		status: DailyOrderStatus.CLOSED,
		fromStatuses: [DailyOrderStatus.ACTIVE],
	});
	if (!ok) throw ErrDailyOrderNotFound;

	return (await getDailyOrderByIdDB({ id: orderId })) ?? { id: orderId };
}

export async function cancelDailyOrder({
	userId,
	orderId,
}: {
	userId: string;
	orderId: string;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrForbidden;

	const vendorId = vendor._id.toString();
	const ok = await setDailyOrderStatusDB({
		id: orderId,
		vendorId,
		status: DailyOrderStatus.CANCELLED,
		fromStatuses: [
			DailyOrderStatus.ACTIVE,
			DailyOrderStatus.CLOSED,
			DailyOrderStatus.DRAFT,
		],
	});
	if (!ok) throw ErrDailyOrderNotFound;

	const refund = await refundOrdersForDailyOrder({
		vendorId,
		dailyOrderId: orderId,
	});

	return { id: orderId, status: DailyOrderStatus.CANCELLED, refund };
}
