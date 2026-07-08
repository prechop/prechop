import { ErrForbidden, ErrOrderNotFound } from "../../constants";
import {
	getBuyerOrderByIdDB,
	getVendorProfileByUserIdDB,
	listBuyerOrdersByBuyerDB,
	listBuyerOrdersByVendorAndDailyOrderDB,
} from "../../models";

export function getMyOrders({
	buyerId,
	limit,
	offset,
}: {
	buyerId: string;
	limit?: number;
	offset?: number;
}) {
	return listBuyerOrdersByBuyerDB({ buyerId, limit, offset });
}

export async function getOrderById({
	userId,
	orderId,
}: {
	userId: string;
	orderId: string;
}) {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;

	const isBuyer = order.buyerId.toString() === userId;
	if (isBuyer) return order;

	// Otherwise only the owning vendor may view it.
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (vendor && order.vendorId.toString() === vendor._id.toString()) {
		return order;
	}
	throw ErrForbidden;
}

export async function getVendorOrdersForDailyOrder({
	vendorUserId,
	dailyOrderId,
}: {
	vendorUserId: string;
	dailyOrderId: string;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId: vendorUserId });
	if (!vendor) throw ErrForbidden;
	return listBuyerOrdersByVendorAndDailyOrderDB({
		vendorId: vendor._id.toString(),
		dailyOrderId,
	});
}
