import { ErrForbidden, ErrOrderNotFound } from "../../constants";
import {
	DailyOrderStatus,
	getBuyerOrderByIdDB,
	getDailyOrderByIdDB,
	getVendorProfileByIdDB,
	type IBuyerOrderItem,
	type IDailyOrder,
	type IDailyOrderItem,
	listDailyOrdersByVendorDB,
	VendorStatus,
} from "../../models";
import { startOfDayInTimezone } from "../../models/utils";

export type ReorderOutcome =
	| "ALL_AVAILABLE"
	| "PARTIAL"
	| "PRICE_CHANGED"
	| "NO_LISTING"
	| "NOT_STARTED"
	| "LISTING_CLOSED"
	| "VENDOR_CLOSED"
	| "VENDOR_GONE";

export interface ReorderPreviewItem {
	snapshotName: string;
	quantity: number;
	status: "AVAILABLE" | "SOLD_OUT" | "REMOVED";
	dailyOrderItemId?: string;
	previousPriceKobo: number;
	currentPriceKobo?: number;
	selectedOptionIds?: string[];
	droppedOptionNames?: string[];
}

export interface ReorderPreview {
	outcome: ReorderOutcome;
	vendor: { id: string; businessName: string | null };
	target?: {
		dailyOrderId: string;
		shareableToken: string;
		availableFrom?: string;
		cutoffTime: string;
	};
	nextListingDate?: string;
	items: ReorderPreviewItem[];
}

/** An item is sold out once its cap is reached. A null cap means unlimited. */
function isSoldOut(item: IDailyOrderItem): boolean {
	if (item.maxQuantity == null) return false;
	return item.orderedQuantity >= item.maxQuantity;
}

function idOf(doc: { _id?: string; id?: string }): string {
	return String(doc.id ?? doc._id ?? "");
}

function toTarget(listing: IDailyOrder): ReorderPreview["target"] {
	return {
		dailyOrderId: idOf(listing),
		shareableToken: listing.shareableToken,
		availableFrom: listing.availableFrom?.toISOString(),
		cutoffTime: new Date(listing.cutoffTime).toISOString(),
	};
}

/**
 * Old option id → the identity we can re-resolve it by on a new listing.
 * Option ids are regenerated for every listing, so the id a buyer ordered
 * yesterday is meaningless today; `sourceGroupId` (the vendor's durable option
 * group) plus the option's name is what actually survives.
 */
interface OptionIdentity {
	sourceGroupId: string | null;
	groupName: string;
	optionName: string;
}

function indexPreviousOptions(
	previousListing: IDailyOrder | null,
): Map<string, OptionIdentity> {
	const index = new Map<string, OptionIdentity>();
	if (!previousListing) return index;
	for (const item of previousListing.items ?? []) {
		for (const group of item.optionGroups ?? []) {
			for (const option of group.options ?? []) {
				index.set(idOf(option), {
					sourceGroupId: group.sourceGroupId ?? null,
					groupName: group.name,
					optionName: option.name,
				});
			}
		}
	}
	return index;
}

/**
 * Re-resolve one previously-selected option against today's listing item.
 * Returns the new option id, or null when it no longer exists (renamed group,
 * dropped option, restructured menu) — the caller reports those as dropped
 * rather than silently ordering something the buyer didn't pick.
 */
function remapOption(
	todayItem: IDailyOrderItem,
	identity: OptionIdentity,
): string | null {
	const groups = todayItem.optionGroups ?? [];
	// Prefer the durable vendor-level group id; fall back to the group name for
	// listings snapshotted before sourceGroupId existed, or built ad hoc.
	const group =
		(identity.sourceGroupId
			? groups.find(
					(g) =>
						g.sourceGroupId != null &&
						String(g.sourceGroupId) === identity.sourceGroupId,
				)
			: undefined) ??
		groups.find(
			(g) =>
				g.name.trim().toLowerCase() ===
				identity.groupName.trim().toLowerCase(),
		);
	if (!group) return null;

	const option = (group.options ?? []).find(
		(o) =>
			o.name.trim().toLowerCase() ===
			identity.optionName.trim().toLowerCase(),
	);
	return option ? idOf(option) : null;
}

function previewItem({
	orderItem,
	todayItem,
	optionIndex,
}: {
	orderItem: IBuyerOrderItem;
	todayItem: IDailyOrderItem | undefined;
	optionIndex: Map<string, OptionIdentity>;
}): ReorderPreviewItem {
	const base = {
		snapshotName: orderItem.snapshotName,
		quantity: orderItem.quantity,
		previousPriceKobo: orderItem.snapshotPriceKobo,
	};

	// The vendor isn't cooking this today at all.
	if (!todayItem) return { ...base, status: "REMOVED" };

	// Listed but capped out. Still report the current price so the UI can show
	// what it *would* have cost rather than a blank.
	if (isSoldOut(todayItem)) {
		return {
			...base,
			status: "SOLD_OUT",
			dailyOrderItemId: idOf(todayItem),
			currentPriceKobo: todayItem.snapshotPriceKobo,
		};
	}

	const selectedOptionIds: string[] = [];
	const droppedOptionNames: string[] = [];
	for (const selected of orderItem.selectedOptions ?? []) {
		// Prefer the previous listing's own structure; fall back to the names
		// denormalised onto the order line, which survive even if the old
		// listing has since been deleted.
		const identity =
			(selected.dailyOrderOptionId
				? optionIndex.get(String(selected.dailyOrderOptionId))
				: undefined) ??
			({
				sourceGroupId: null,
				groupName: selected.groupName,
				optionName: selected.snapshotName,
			} satisfies OptionIdentity);

		const remapped = remapOption(todayItem, identity);
		if (remapped) selectedOptionIds.push(remapped);
		else droppedOptionNames.push(selected.snapshotName);
	}

	return {
		...base,
		status: "AVAILABLE",
		dailyOrderItemId: idOf(todayItem),
		currentPriceKobo: todayItem.snapshotPriceKobo,
		selectedOptionIds,
		...(droppedOptionNames.length ? { droppedOptionNames } : {}),
	};
}

/**
 * "Order Again" — can this past order be repeated right now, and at what price?
 *
 * Returns exactly one `outcome`. Precedence is deliberate, blocker-first:
 *
 *   VENDOR_GONE   the shop is deactivated/deleted — permanent, nothing to offer.
 *   VENDOR_CLOSED the kitchen's master switch is off. No listing is orderable,
 *                 so reporting a listing-level state would misdirect the buyer.
 *   NO_LISTING    nothing published to order into.
 *   NOT_STARTED   published, but ordering hasn't opened yet (availableFrom).
 *   LISTING_CLOSED published, but every listing is past cutoff.
 *   PARTIAL       something is sold out or gone — strictly worse than a price move.
 *   PRICE_CHANGED everything's there, but at least one price moved.
 *   ALL_AVAILABLE
 *
 * This must live server-side: the mapping from the buyer's historical
 * `menuItemId` to *today's* `dailyOrderItemId`, and the remap of per-listing
 * option ids, depend on fields (`menuItemId`, `sourceGroupId`) the wire
 * `BuyerOrderItem` deliberately never exposes. A client cannot compute it.
 *
 * Read-only: nothing is reserved or charged. Availability here is advisory —
 * `placeOrder` re-checks every slot, price and vendor state authoritatively,
 * so a race between preview and submit fails safely at submit.
 */
export async function getReorderPreview({
	userId,
	buyerOrderId,
	now = new Date(),
}: {
	userId: string;
	buyerOrderId: string;
	now?: Date;
}): Promise<ReorderPreview> {
	const order = await getBuyerOrderByIdDB({ id: buyerOrderId });
	if (!order) throw ErrOrderNotFound;
	// Per-request, server-side ownership check: only the buyer who placed the
	// order may reorder it. Never inferred from anything client-supplied.
	if (order.buyerId.toString() !== userId) throw ErrForbidden;

	const vendorId = order.vendorId.toString();
	const vendorProfile = await getVendorProfileByIdDB({ id: vendorId });

	if (!vendorProfile || vendorProfile.status !== VendorStatus.ACTIVE) {
		return {
			outcome: "VENDOR_GONE",
			vendor: {
				id: vendorId,
				businessName: vendorProfile?.businessName ?? null,
			},
			items: [],
		};
	}

	const vendor = {
		id: vendorId,
		businessName: vendorProfile.businessName ?? null,
	};

	if (!vendorProfile.isOpenForOrders) {
		return { outcome: "VENDOR_CLOSED", vendor, items: [] };
	}

	// Only ACTIVE + public listings are offerable. A DRAFT listing is not a
	// promise: surfacing its date would advertise a meal the vendor hasn't
	// published and may never run.
	const listings = (
		await listDailyOrdersByVendorDB({
			vendorId,
			status: DailyOrderStatus.ACTIVE,
		})
	).filter((l) => l.isPublic);

	const nowMs = now.getTime();
	const stillOpen = listings.filter(
		(l) => new Date(l.cutoffTime).getTime() > nowMs,
	);
	const orderable = stillOpen
		.filter((l) => !l.availableFrom || l.availableFrom.getTime() <= nowMs)
		.sort(
			(a, b) =>
				new Date(a.cutoffTime).getTime() -
				new Date(b.cutoffTime).getTime(),
		);

	if (orderable.length === 0) {
		// Published but not yet open for orders — the buyer should come back.
		const upcoming = stillOpen
			.filter((l) => l.availableFrom && l.availableFrom.getTime() > nowMs)
			.sort(
				(a, b) =>
					(a.availableFrom?.getTime() ?? 0) -
					(b.availableFrom?.getTime() ?? 0),
			);
		if (upcoming.length > 0) {
			const next = upcoming[0];
			return {
				outcome: "NOT_STARTED",
				vendor,
				target: toTarget(next),
				nextListingDate: new Date(next.scheduledDate).toISOString(),
				items: [],
			};
		}
		// There were listings today, but every one has passed its cutoff.
		//
		// Both shapes count as "closed", and the CLOSED one is the common case:
		// the cutoff sweep flips ACTIVE→CLOSED every minute, so an ACTIVE listing
		// sitting past its cutoff exists for under a minute. Looking only at
		// ACTIVE here would make LISTING_CLOSED effectively unreachable and
		// report NO_LISTING for a kitchen that was cooking an hour ago — which
		// reads as "this vendor never cooks" instead of "you missed today's
		// cutoff, come back tomorrow".
		const closedToday = (
			await listDailyOrdersByVendorDB({
				vendorId,
				status: DailyOrderStatus.CLOSED,
				from: startOfDayInTimezone(now),
			})
		).filter((l) => l.isPublic);

		const closed = [...listings, ...closedToday];
		if (closed.length > 0) {
			const latest = closed.sort(
				(a, b) =>
					new Date(b.cutoffTime).getTime() -
					new Date(a.cutoffTime).getTime(),
			)[0];
			return {
				outcome: "LISTING_CLOSED",
				vendor,
				target: toTarget(latest),
				items: [],
			};
		}
		return { outcome: "NO_LISTING", vendor, items: [] };
	}

	const target = orderable[0];

	// The listing the order was originally placed against — the only place the
	// old option ids can be resolved back to (group, option) names. May be gone.
	const previousListing = await getDailyOrderByIdDB({
		id: order.dailyOrderId.toString(),
	}).catch(() => null);
	const optionIndex = indexPreviousOptions(previousListing);

	const todayByMenuItemId = new Map<string, IDailyOrderItem>();
	for (const item of target.items ?? []) {
		if (item.menuItemId)
			todayByMenuItemId.set(String(item.menuItemId), item);
	}

	const items = (order.items ?? []).map((orderItem) =>
		previewItem({
			orderItem,
			todayItem: orderItem.menuItemId
				? todayByMenuItemId.get(String(orderItem.menuItemId))
				: undefined,
			optionIndex,
		}),
	);

	const anyUnavailable = items.some((i) => i.status !== "AVAILABLE");
	const anyPriceChanged = items.some(
		(i) =>
			i.status === "AVAILABLE" &&
			i.currentPriceKobo !== undefined &&
			i.currentPriceKobo !== i.previousPriceKobo,
	);
	// An option that no longer maps changes what the buyer receives, so it is a
	// PARTIAL, not a silent success — the UI must surface the drop.
	const anyOptionDropped = items.some(
		(i) => (i.droppedOptionNames?.length ?? 0) > 0,
	);

	const outcome: ReorderOutcome =
		anyUnavailable || anyOptionDropped
			? "PARTIAL"
			: anyPriceChanged
				? "PRICE_CHANGED"
				: "ALL_AVAILABLE";

	return { outcome, vendor, target: toTarget(target), items };
}
