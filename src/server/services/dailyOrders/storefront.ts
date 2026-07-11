import { ErrVendorNotFound } from "../../constants";
import {
	DailyOrderStatus,
	findVendorIdsByListingSearchDB,
	findVendorIdsByMenuSearchDB,
	findVendorIdsByNameDB,
	getVendorProfileByIdDB,
	type IDailyOrder,
	type IMenuItem,
	type IVendorProfile,
	listDailyOrdersByVendorDB,
	listMenuItemsByVendorDB,
	VendorStatus,
} from "../../models";
import { campusIdsInSameState } from "./queries";

/** Public-safe subset of a vendor profile — no email/bank/payout secrets. */
export interface PublicVendor {
	id: string;
	businessName: string | null;
	description: string | null;
	profileImageUrl: string | null;
	campusId: string;
	state: string | null;
	areaOrAddress: string | null;
	categories: string[];
	rating: number;
	totalReviews: number;
	totalOrders: number;
	isOpenForOrders: boolean;
}

function toPublicVendor(v: IVendorProfile): PublicVendor {
	return {
		id: v._id.toString(),
		businessName: v.businessName ?? null,
		description: v.description ?? null,
		profileImageUrl: v.profileImageUrl ?? null,
		campusId: v.campusId.toString(),
		state: v.state ?? null,
		areaOrAddress: v.areaOrAddress ?? null,
		categories: v.categories ?? [],
		rating: v.rating ?? 0,
		totalReviews: v.totalReviews ?? 0,
		totalOrders: v.totalOrders ?? 0,
		isOpenForOrders: v.isOpenForOrders ?? false,
	};
}

/** A vendor's active, public, still-open listings (its "cooking today"). */
async function activeListingsForVendor(
	vendorId: string,
): Promise<IDailyOrder[]> {
	const now = Date.now();
	const listings = await listDailyOrdersByVendorDB({
		vendorId,
		status: DailyOrderStatus.ACTIVE,
	});
	return listings.filter(
		(o) => o.isPublic && new Date(o.cutoffTime).getTime() > now,
	);
}

/**
 * A vendor's public storefront: profile, everything they're cooking today
 * (active listings), and their full available menu. Used by `/v/[vendorId]`.
 */
export async function getVendorStorefront({
	vendorId,
}: {
	vendorId: string;
}): Promise<{
	vendor: PublicVendor;
	listings: IDailyOrder[];
	menu: IMenuItem[];
}> {
	const vendor = await getVendorProfileByIdDB({ id: vendorId });
	if (!vendor || vendor.status !== VendorStatus.ACTIVE)
		throw ErrVendorNotFound;
	const [listings, menu] = await Promise.all([
		activeListingsForVendor(vendorId),
		listMenuItemsByVendorDB({ vendorId, availableOnly: true }),
	]);
	return { vendor: toPublicVendor(vendor), listings, menu };
}

export interface VendorSearchHit {
	vendor: PublicVendor;
	listings: IDailyOrder[];
	/** Which dimensions matched: any of "shop" | "menu" | "listing". */
	matchedOn: string[];
}

/**
 * Comprehensive marketplace search across the buyer's whole state. Finds vendors
 * by shop name, by an available menu item, or by an active listing (title/item),
 * then returns each matched vendor with its current listings (the "close data" —
 * cutoff times live on the listings). Own listings are never excluded here since
 * this is a lookup tool, not the order grid.
 */
export async function searchMarketplace({
	campusId,
	q,
	limit = 20,
}: {
	campusId: string;
	q: string;
	limit?: number;
}): Promise<VendorSearchHit[]> {
	const term = q.trim();
	if (!term) return [];
	const campusIds = await campusIdsInSameState(campusId);

	const [byName, byMenu, byListing] = await Promise.all([
		findVendorIdsByNameDB({ campusIds, q: term }),
		findVendorIdsByMenuSearchDB({ campusIds, q: term }),
		findVendorIdsByListingSearchDB({ campusIds, q: term }),
	]);

	// Union of vendorIds → which dimensions each matched on.
	const matched = new Map<string, Set<string>>();
	const add = (idList: string[], dim: string) => {
		for (const id of idList) {
			const set = matched.get(id) ?? new Set<string>();
			set.add(dim);
			matched.set(id, set);
		}
	};
	add(byName, "shop");
	add(byMenu, "menu");
	add(byListing, "listing");

	const vendorIds = [...matched.keys()].slice(0, limit);
	const hits = await Promise.all(
		vendorIds.map(async (id) => {
			const vendor = await getVendorProfileByIdDB({ id });
			if (!vendor || vendor.status !== VendorStatus.ACTIVE) return null;
			const listings = await activeListingsForVendor(id);
			return {
				vendor: toPublicVendor(vendor),
				listings,
				matchedOn: [...(matched.get(id) ?? [])],
			} satisfies VendorSearchHit;
		}),
	);

	// Best-rated shops first.
	return hits
		.filter((h): h is VendorSearchHit => h !== null)
		.sort((a, b) => b.vendor.rating - a.vendor.rating);
}
