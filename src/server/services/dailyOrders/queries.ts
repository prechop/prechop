import { ErrDailyOrderNotFound, ErrForbidden } from "../../constants";
import {
	type DailyOrderStatus,
	getDailyOrderByIdDB,
	getDailyOrderByTokenDB,
	getVendorProfileByIdDB,
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
	// Resolve the listing's vendor once, for two client flags:
	//  - isOwnListing: the caller owns it (self-order block); and
	//  - vendorOpen: the kitchen is currently accepting orders.
	// Both are authoritatively re-enforced server-side in `placeOrder`.
	const vendor = await getVendorProfileByIdDB({
		id: order.vendorId.toString(),
	});
	const vendorOpen = vendor?.isOpenForOrders ?? false;
	const isOwnListing =
		!!viewerUserId && vendor?.userId?.toString() === viewerUserId;
	return { ...order, isOwnListing, vendorOpen };
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
