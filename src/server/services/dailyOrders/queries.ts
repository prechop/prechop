import { ErrDailyOrderNotFound, ErrForbidden } from "../../constants";
import {
	type DailyOrderStatus,
	getCampusByIdDB,
	getDailyOrderByIdDB,
	getDailyOrderByTokenDB,
	getVendorProfileByIdDB,
	getVendorProfileByUserIdDB,
	listActiveDailyOrdersByCampusDB,
	listCampusesDB,
	listDailyOrdersByVendorDB,
} from "../../models";

/**
 * Every campus in the same state as `campusId` (including it). Buyers browse
 * kitchens across their whole state, not just their own campus. Falls back to
 * just the given campus if its state can't be resolved.
 */
export async function campusIdsInSameState(
	campusId: string,
): Promise<string[]> {
	const campus = await getCampusByIdDB({ id: campusId });
	if (!campus?.state) return [campusId];
	const siblings = await listCampusesDB({ state: campus.state });
	const ids = siblings.map((c) => c._id.toString());
	if (!ids.includes(campusId)) ids.push(campusId);
	return ids;
}

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
	const campusIds = await campusIdsInSameState(campusId);
	return listActiveDailyOrdersByCampusDB({
		campusIds,
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
	// Shop identity for the storefront link on the public order page.
	const vendorId = order.vendorId.toString();
	const vendorName = vendor?.businessName ?? null;
	return { ...order, isOwnListing, vendorOpen, vendorId, vendorName };
}

export async function getMyDailyOrders({
	userId,
	status,
	q,
	from,
	to,
	limit,
	offset,
}: {
	userId: string;
	status?: DailyOrderStatus;
	/** Case-insensitive title search. */
	q?: string;
	/** Inclusive scheduledDate lower/upper bounds. */
	from?: Date;
	to?: Date;
	limit?: number;
	offset?: number;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrForbidden;
	return listDailyOrdersByVendorDB({
		vendorId: vendor._id.toString(),
		status,
		q,
		from,
		to,
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
