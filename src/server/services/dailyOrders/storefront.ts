import { ErrVendorNotFound } from "../../constants";
import {
	DailyOrderStatus,
	findVendorIdsByListingSearchDB,
	findVendorIdsByMenuSearchDB,
	findVendorIdsByNameDB,
	getVendorProfileByIdDB,
	type IDailyOrder,
	type IMenuItem,
	listActivePublicListingsForVendorIdsDB,
	listDailyOrdersByVendorDB,
	listMenuItemsByVendorDB,
	listVendorsByIdsDB,
	VendorStatus,
} from "../../models";
import { assertMarketplaceEnabled } from "../siteConfigs";
import {
	comparePublicVendors,
	type PublicVendor,
	toPublicVendor,
} from "../vendors/publicVendor";
import { campusIdsInSameState } from "./queries";

// `PublicVendor` / `toPublicVendor` now live in services/vendors/publicVendor so
// the storefront, marketplace and search payloads share one mapper — and one
// rating trust gate. Re-exported to keep existing importers working.
export type { PublicVendor };

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
	await assertMarketplaceEnabled();
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
	await assertMarketplaceEnabled();
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

	// Two batched reads instead of ~2 queries per matched vendor: one `$in` fetch
	// of every matched profile, and one batched fetch of all their active/public/
	// still-open listings (the same predicates `activeListingsForVendor` applied
	// per vendor — status ACTIVE, isPublic, cutoffTime > now — in the same
	// `scheduledDate: -1` order). Grouping the flat listing result by vendor
	// reproduces the previous per-vendor shape and ordering exactly. Mirrors
	// `getMarketplace` in ./queries.
	const now = new Date();
	const [vendors, listings] = await Promise.all([
		listVendorsByIdsDB(vendorIds),
		listActivePublicListingsForVendorIdsDB({ vendorIds, now }),
	]);
	const vendorById = new Map(vendors.map((v) => [v._id.toString(), v]));
	const listingsByVendor = new Map<string, IDailyOrder[]>();
	for (const listing of listings) {
		const key = listing.vendorId.toString();
		const bucket = listingsByVendor.get(key);
		if (bucket) bucket.push(listing);
		else listingsByVendor.set(key, [listing]);
	}

	const hits = vendorIds
		.map((id) => {
			const vendor = vendorById.get(id);
			if (!vendor || vendor.status !== VendorStatus.ACTIVE) return null;
			return {
				vendor: toPublicVendor(vendor),
				listings: listingsByVendor.get(id) ?? [],
				matchedOn: [...(matched.get(id) ?? [])],
			} satisfies VendorSearchHit;
		})
		.filter((h): h is VendorSearchHit => h !== null);

	// Open kitchens first, then best-rated. Unrated shops sort last.
	return hits.sort((a, b) => comparePublicVendors(a.vendor, b.vendor));
}
