import { ErrDailyOrderNotFound, ErrForbidden } from "../../constants";
import {
	type DailyOrderStatus,
	getCampusByIdDB,
	getDailyOrderByIdDB,
	getDailyOrderByTokenDB,
	getVendorProfileByIdDB,
	getVendorProfileByUserIdDB,
	type IDailyOrder,
	listActivePublicListingsForVendorIdsDB,
	listCampusesDB,
	listDailyOrdersByVendorDB,
	listMarketplaceVendorsDB,
} from "../../models";
import { assertMarketplaceEnabled } from "../siteConfigs";
import {
	comparePublicVendors,
	publicRating,
	toPublicVendor,
} from "../vendors/publicVendor";

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

export async function marketplaceCampusIds(
	campusId?: string,
): Promise<string[]> {
	if (campusId) return campusIdsInSameState(campusId);
	const campuses = await listCampusesDB({ activeOnly: true });
	return campuses.map((campus) => campus._id.toString());
}

export async function getMarketplace({
	campusId,
	limit,
	offset,
	viewerUserId,
}: {
	campusId?: string;
	limit?: number;
	offset?: number;
	/** The signed-in caller (if any); their own listings are excluded. */
	viewerUserId?: string;
}) {
	await assertMarketplaceEnabled();
	let excludeVendorId: string | undefined;
	if (viewerUserId) {
		const vendor = await getVendorProfileByUserIdDB({
			userId: viewerUserId,
		});
		if (vendor) excludeVendorId = vendor._id.toString();
	}
	const campusIds = await marketplaceCampusIds(campusId);
	const vendors = await listMarketplaceVendorsDB({
		campusIds,
		limit,
		offset,
		excludeVendorId,
	});
	// One batched query for every vendor's active/public/still-open listings
	// instead of one round-trip per vendor (was 61 queries for a 60-vendor feed
	// on a path polled every 10s). The DB applies the same effective predicates
	// `activePublicListingsForVendor` did in memory — status ACTIVE, isPublic,
	// cutoffTime > now — and returns them in the same `scheduledDate: -1` order,
	// so grouping the flat result by vendor reproduces the previous per-vendor
	// shape and ordering exactly.
	const now = new Date();
	const listings = await listActivePublicListingsForVendorIdsDB({
		vendorIds: vendors.map((vendor) => vendor._id.toString()),
		now,
	});
	const listingsByVendor = new Map<string, IDailyOrder[]>();
	for (const listing of listings) {
		const key = listing.vendorId.toString();
		const bucket = listingsByVendor.get(key);
		if (bucket) bucket.push(listing);
		else listingsByVendor.set(key, [listing]);
	}
	const rows = vendors.map((vendor) => {
		const publicVendor = toPublicVendor(vendor);
		const vendorListings =
			listingsByVendor.get(vendor._id.toString()) ?? [];
		return {
			vendor: publicVendor,
			// Stamp the vendor's trust/availability signals onto each
			// listing. The feed is grouped by vendor, but cards are rendered
			// (and can be re-sorted, filtered or flattened) per listing —
			// without these a card has no way to show "Closed" or a rating
			// except by walking back up to its parent, which the flattened
			// views don't do. Rating is the *gated* value, so a
			// sub-threshold score never crosses the wire here either.
			listings: vendorListings.map((listing) => ({
				...listing,
				vendorOpen: publicVendor.isOpenForOrders,
				vendorName: publicVendor.businessName,
				vendorRating: publicVendor.rating,
				vendorTotalReviews: publicVendor.totalReviews,
			})),
		};
	});
	return rows.sort((a, b) => comparePublicVendors(a.vendor, b.vendor));
}

export async function getPublicDailyOrder({
	shareableToken,
	viewerUserId,
}: {
	shareableToken: string;
	/** The signed-in caller (if any); used to flag their own listing. */
	viewerUserId?: string;
}) {
	await assertMarketplaceEnabled();
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
	// Same trust gate as the feed — the listing page shows the shop's rating.
	const vendorTotalReviews = vendor?.totalReviews ?? 0;
	const vendorRating = publicRating(vendor?.rating, vendorTotalReviews);
	return {
		...order,
		isOwnListing,
		vendorOpen,
		vendorId,
		vendorName,
		vendorRating,
		vendorTotalReviews,
	};
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
