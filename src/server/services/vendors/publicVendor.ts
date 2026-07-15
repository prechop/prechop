import type { IVendorProfile } from "@/server/models";

/**
 * Reviews required before a vendor's average rating is shown publicly
 * (PRD §8.12). Below this the score is a rumour, not a signal: one 5-star
 * review from a friend renders an unqualified "5.0" that outranks a kitchen
 * with fifty reviews averaging 4.6.
 *
 * The PRD contradicts itself — §8.6 says "fewer than 5 completed **orders**",
 * §8.12 says "5 completed **reviews**". Reviews is the correct gate and the one
 * implemented here: gating on orders would let a vendor with 50 orders and a
 * single review publish a 5.0, which is exactly the manipulation the rule
 * exists to stop. Orders are also not a measure of how much *rating* evidence
 * exists. Raised with the orchestrator — see HANDOFF.
 */
export const MIN_REVIEWS_FOR_PUBLIC_RATING = 5;

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
	/**
	 * null until the vendor has at least `MIN_REVIEWS_FOR_PUBLIC_RATING`
	 * reviews. Nulled **server-side** so a sub-threshold score never crosses the
	 * wire — a client-side gate would still ship the number to anyone reading
	 * the response body.
	 */
	rating: number | null;
	totalReviews: number;
	totalOrders: number;
	isOpenForOrders: boolean;
}

/**
 * The publishable rating for a vendor: their average once enough reviews back
 * it, otherwise null ("New kitchen" / "Not enough reviews yet" in the UI).
 */
export function publicRating(
	rating: number | null | undefined,
	totalReviews: number | null | undefined,
): number | null {
	const count = totalReviews ?? 0;
	if (count < MIN_REVIEWS_FOR_PUBLIC_RATING) return null;
	return rating ?? null;
}

/**
 * Single mapper for every public vendor payload (marketplace, storefront,
 * search). One function so the trust gate cannot be applied on one surface and
 * forgotten on another.
 */
export function toPublicVendor(v: IVendorProfile): PublicVendor {
	const totalReviews = v.totalReviews ?? 0;
	return {
		id: v._id.toString(),
		businessName: v.businessName ?? null,
		description: v.description ?? null,
		profileImageUrl: v.profileImageUrl ?? null,
		campusId: v.campusId.toString(),
		state: v.state ?? null,
		areaOrAddress: v.areaOrAddress ?? null,
		categories: v.categories ?? [],
		rating: publicRating(v.rating, totalReviews),
		totalReviews,
		totalOrders: v.totalOrders ?? 0,
		isOpenForOrders: v.isOpenForOrders ?? false,
	};
}

/**
 * Sort comparator for public vendors: open kitchens first, then by rating.
 * Ungated (null) ratings sort below every rated vendor rather than above them —
 * `b.rating - a.rating` on a null coerces to 0 and would rank a brand-new shop
 * ahead of a 4.8-star one.
 */
export function comparePublicVendors(a: PublicVendor, b: PublicVendor): number {
	const openDelta = Number(b.isOpenForOrders) - Number(a.isOpenForOrders);
	if (openDelta !== 0) return openDelta;
	return (b.rating ?? -1) - (a.rating ?? -1);
}
