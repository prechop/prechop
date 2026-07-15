import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redis } from "@/server/databases/redis";
import {
	createVendorProfileDB,
	FulfillmentType,
	setVendorOpenForOrdersDB,
	setVendorStatusDB,
	VendorStatus,
} from "@/server/models";
import { paystackProvider } from "@/server/providers/paystack";
import { placeOrder } from "@/server/services/buyerOrders/placeOrder";
import {
	getMarketplace,
	getPublicDailyOrder,
} from "@/server/services/dailyOrders";
import { can, resolvePermissions } from "@/server/services/iam";
import { invalidateSiteConfigsCache } from "@/server/services/siteConfigs/getSiteConfigs";
import { connectTestDB, dropAndDisconnect } from "../helpers/db";
import {
	makeActiveDailyOrder,
	makeCampus,
	makeUser,
	makeUserInGroup,
	makeVendor,
	seedTestIam,
} from "../helpers/factories";

// A seller may shop the marketplace and order from OTHER vendors, but never
// from their own listing. Two guarantees back that: buying is a universal
// capability (every active user has `buyer:order:*`), and `placeOrder` enforces
// a self-order invariant. Own listings are also hidden from the vendor's own
// marketplace grid and flagged on the public order page.

const slotKeys = new Set<string>();

beforeAll(async () => {
	await connectTestDB();
	invalidateSiteConfigsCache();
	vi.spyOn(paystackProvider, "initializeTransaction").mockResolvedValue({
		authorization_url: "https://paystack.test/pay/abc",
		access_code: "acc_123",
		reference: "ref_123",
	});
});

afterAll(async () => {
	vi.restoreAllMocks();
	invalidateSiteConfigsCache();
	if (slotKeys.size) await Redis.del(...slotKeys);
	await dropAndDisconnect();
});

/** Track a listing's slot keys so the shared Redis is left clean. */
function trackSlots(listing: { items: Array<{ _id?: unknown }> }) {
	for (const it of listing.items) {
		slotKeys.add(
			`slot:reserved:${(it._id as { toString(): string }).toString()}`,
		);
	}
}

/** A vendor (user + profile) pinned to a specific campus, for shared-campus tests. */
async function vendorOnCampus(campusId: string) {
	const user = await makeUser({ campusId });
	const userId = user!._id.toString();
	const profile = await createVendorProfileDB({
		payload: {
			userId,
			campusId,
			email: `v-${Math.random().toString(36).slice(2)}@prechop.test`,
			businessName: "Test Kitchen",
		},
	});
	const vendorId = profile!._id.toString();
	// A profile is born INCOMPLETE, and only ACTIVE kitchens are discoverable in
	// the marketplace. Activate so this fixture represents a real operating
	// vendor rather than a half-onboarded one.
	await setVendorStatusDB({ id: vendorId, status: VendorStatus.ACTIVE });
	// Open for orders: the schema default is closed.
	await setVendorOpenForOrdersDB({ id: vendorId, isOpenForOrders: true });
	return { userId, vendorId };
}

describe("buying is a universal capability", () => {
	it("grants buyer ordering to a Vendors-group account", async () => {
		await seedTestIam();
		const user = await makeUserInGroup("Vendors");
		const resolved = await resolvePermissions(user!._id.toString());

		// A pure vendor account can now place & read buyer orders …
		expect(can(resolved.statements, "buyer:order:create")).toBe(true);
		expect(can(resolved.statements, "buyer:order:read")).toBe(true);
		// … while keeping its selling capabilities.
		expect(can(resolved.statements, "vendorApp:manage")).toBe(true);
	});
});

describe("self-order guard", () => {
	it("rejects a vendor ordering from their own listing", async () => {
		const { userId, vendorId, campusId } = await makeVendor({
			withSubaccount: true,
		});
		const listing = await makeActiveDailyOrder({ vendorId, campusId });
		trackSlots(listing);
		const itemId = listing.items[0]._id!.toString();

		await expect(
			placeOrder({
				buyerId: userId, // the same person owns the vendor profile
				campusId,
				input: {
					dailyOrderId: listing._id.toString(),
					fulfillmentType: FulfillmentType.PICKUP,
					items: [{ dailyOrderItemId: itemId, quantity: 1 }],
				},
			}),
		).rejects.toThrow(/your own listing/i);
	});

	it("lets a different buyer order that same listing", async () => {
		const { vendorId, campusId } = await makeVendor({
			withSubaccount: true,
		});
		const listing = await makeActiveDailyOrder({ vendorId, campusId });
		trackSlots(listing);
		const itemId = listing.items[0]._id!.toString();
		const buyer = await makeUser({ campusId });

		const result = await placeOrder({
			buyerId: buyer!._id.toString(),
			campusId,
			input: {
				dailyOrderId: listing._id.toString(),
				fulfillmentType: FulfillmentType.PICKUP,
				items: [{ dailyOrderItemId: itemId, quantity: 1 }],
			},
		});
		expect(result.orderNumber).toMatch(/^PCH-/);
	});

	it("lets a vendor buy from ANOTHER vendor's listing", async () => {
		// The seller and a second, distinct vendor share a campus. The second
		// vendor — who owns their own vendor profile — acts as the buyer here, the
		// exact "switched to buying" path: a seller ordering someone ELSE's food.
		const { vendorId, campusId } = await makeVendor({
			withSubaccount: true,
		});
		const listing = await makeActiveDailyOrder({ vendorId, campusId });
		trackSlots(listing);
		const itemId = listing.items[0]._id!.toString();

		const buyerVendor = await vendorOnCampus(campusId);
		// Sanity: the buyer really is a different vendor, not the seller.
		expect(buyerVendor.vendorId).not.toBe(vendorId);

		const result = await placeOrder({
			buyerId: buyerVendor.userId,
			campusId,
			input: {
				dailyOrderId: listing._id.toString(),
				fulfillmentType: FulfillmentType.PICKUP,
				items: [{ dailyOrderItemId: itemId, quantity: 1 }],
			},
		});
		expect(result.orderNumber).toMatch(/^PCH-/);
	});
});

describe("own listings are hidden from the vendor's buyer view", () => {
	it("excludes the caller's own listing from the marketplace grid", async () => {
		const campus = await makeCampus();
		const campusId = campus!._id.toString();
		const me = await vendorOnCampus(campusId);
		const other = await vendorOnCampus(campusId);
		const mine = await makeActiveDailyOrder({
			vendorId: me.vendorId,
			campusId,
		});
		const theirs = await makeActiveDailyOrder({
			vendorId: other.vendorId,
			campusId,
		});
		trackSlots(mine);
		trackSlots(theirs);

		// The grid is grouped by vendor, so "my own listing is hidden" means my
		// whole kitchen row is absent — a vendor cannot buy from themselves.
		const asVendor = await getMarketplace({
			campusId,
			viewerUserId: me.userId,
		});
		const listingIds = (rows: typeof asVendor) =>
			rows.flatMap((r) => r.listings.map((o) => o._id.toString()));

		expect(asVendor.map((r) => r.vendor.id)).toContain(other.vendorId);
		expect(asVendor.map((r) => r.vendor.id)).not.toContain(me.vendorId);
		expect(listingIds(asVendor)).toContain(theirs._id.toString());
		expect(listingIds(asVendor)).not.toContain(mine._id.toString());

		// Anonymous callers still see every listing (public browse).
		const anon = await getMarketplace({ campusId });
		expect(listingIds(anon)).toContain(mine._id.toString());
		expect(listingIds(anon)).toContain(theirs._id.toString());
	});

	it("flags the caller's own listing on the public order page", async () => {
		const campus = await makeCampus();
		const campusId = campus!._id.toString();
		const me = await vendorOnCampus(campusId);
		const other = await vendorOnCampus(campusId);
		const mine = await makeActiveDailyOrder({
			vendorId: me.vendorId,
			campusId,
		});
		const theirs = await makeActiveDailyOrder({
			vendorId: other.vendorId,
			campusId,
		});
		trackSlots(mine);
		trackSlots(theirs);

		const own = await getPublicDailyOrder({
			shareableToken: mine.shareableToken,
			viewerUserId: me.userId,
		});
		expect(own.isOwnListing).toBe(true);

		const notOwn = await getPublicDailyOrder({
			shareableToken: theirs.shareableToken,
			viewerUserId: me.userId,
		});
		expect(notOwn.isOwnListing).toBe(false);

		const anon = await getPublicDailyOrder({
			shareableToken: mine.shareableToken,
		});
		expect(anon.isOwnListing).toBe(false);
	});
});
