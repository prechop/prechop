import { ErrDailyOrderNotFound, ErrForbidden } from "../../constants";
import {
	type DailyOrderStatus,
	getDailyOrderByIdDB,
	getDailyOrderByTokenDB,
	getVendorProfileByUserIdDB,
	listActiveDailyOrdersByCampusDB,
	listDailyOrdersByVendorDB,
} from "../../models";

export async function getMarketplace({
	campusId,
	limit,
	offset,
	viewerUserId,
}: {
	campusId: string;
	limit?: number;
	offset?: number;
	/** The signed-in caller (if any); their own listings are excluded. */
	viewerUserId?: string;
}) {
	let excludeVendorId: string | undefined;
	if (viewerUserId) {
		const vendor = await getVendorProfileByUserIdDB({
			userId: viewerUserId,
		});
		if (vendor) excludeVendorId = vendor._id.toString();
	}
	return listActiveDailyOrdersByCampusDB({
		campusId,
		limit,
		offset,
		excludeVendorId,
	});
}

export async function getPublicDailyOrder({
	shareableToken,
	viewerUserId,
}: {
	shareableToken: string;
	/** The signed-in caller (if any); used to flag their own listing. */
	viewerUserId?: string;
}) {
	const order = await getDailyOrderByTokenDB({ shareableToken });
	if (!order) throw ErrDailyOrderNotFound;
	// Flag when the caller owns this listing so the client can block ordering.
	// The authoritative block is the self-order guard in `placeOrder`.
	let isOwnListing = false;
	if (viewerUserId) {
		const vendor = await getVendorProfileByUserIdDB({
			userId: viewerUserId,
		});
		if (vendor && vendor._id.toString() === order.vendorId.toString()) {
			isOwnListing = true;
		}
	}
	return { ...order, isOwnListing };
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
