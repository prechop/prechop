import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redis } from "@/server/databases/redis";
import { FulfillmentType, setVendorOpenForOrdersDB } from "@/server/models";
import { paystackProvider } from "@/server/providers/paystack";
import { placeOrder } from "@/server/services/buyerOrders/placeOrder";
import {
	getMarketplace,
	getPublicDailyOrder,
} from "@/server/services/dailyOrders";
import { invalidateSiteConfigsCache } from "@/server/services/siteConfigs/getSiteConfigs";
import { connectTestDB, dropAndDisconnect } from "../helpers/db";
import {
	makeActiveDailyOrder,
	makeUser,
	makeVendor,
} from "../helpers/factories";

// The vendor open/closed switch (isOpenForOrders) must actually gate the buyer
// flow: a closed kitchen accepts no new orders (placeOrder rejects) and its
// public listing page reports vendorOpen=false so the client can show a closed
// state.
//
// A closed kitchen is NOT removed from the marketplace grid: it stays browsable
// for its menu, prices and ratings, and is sorted below the open ones. The
// enforcement is at order time, not at discovery time.

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

function trackSlots(listing: { items: Array<{ _id?: unknown }> }) {
	for (const it of listing.items) {
		slotKeys.add(
			`slot:reserved:${(it._id as { toString(): string }).toString()}`,
		);
	}
}

describe("placeOrder respects the vendor open/closed switch", () => {
	it("rejects an order when the vendor is closed", async () => {
		// makeVendor opens the kitchen by default; close it explicitly.
		const { vendorId, campusId } = await makeVendor({
			withSubaccount: true,
		});
		await setVendorOpenForOrdersDB({
			id: vendorId,
			isOpenForOrders: false,
		});
		const listing = await makeActiveDailyOrder({ vendorId, campusId });
		trackSlots(listing);
		const itemId = listing.items[0]._id!.toString();
		const buyer = await makeUser({ campusId });

		await expect(
			placeOrder({
				buyerId: buyer!._id.toString(),
				campusId,
				input: {
					dailyOrderId: listing._id.toString(),
					fulfillmentType: FulfillmentType.PICKUP,
					items: [{ dailyOrderItemId: itemId, quantity: 1 }],
				},
			}),
		).rejects.toThrow(/accepting orders/i);
	});

	it("allows an order when the vendor is open, then blocks after closing", async () => {
		const { vendorId, campusId } = await makeVendor({
			withSubaccount: true,
		});
		const listing = await makeActiveDailyOrder({ vendorId, campusId });
		trackSlots(listing);
		const itemId = listing.items[0]._id!.toString();
		const buyer = await makeUser({ campusId });

		const order = {
			buyerId: buyer!._id.toString(),
			campusId,
			input: {
				dailyOrderId: listing._id.toString(),
				fulfillmentType: FulfillmentType.PICKUP,
				items: [{ dailyOrderItemId: itemId, quantity: 1 }],
			},
		};

		// Open (default): succeeds.
		const res = await placeOrder(order);
		expect(res.orderNumber).toMatch(/^PCH-/);

		// Close: the same order is now rejected.
		await setVendorOpenForOrdersDB({
			id: vendorId,
			isOpenForOrders: false,
		});
		await expect(placeOrder(order)).rejects.toThrow(/accepting orders/i);
	});
});

describe("closed vendors stay browsable but are demoted", () => {
	it("keeps a closed vendor's listing in the grid, flagged closed", async () => {
		const { vendorId, campusId } = await makeVendor();
		const listing = await makeActiveDailyOrder({ vendorId, campusId });
		trackSlots(listing);

		const rowFor = async (id: string) => {
			const grid = await getMarketplace({ campusId });
			return grid.find((r) => r.vendor.id === id);
		};

		// Open → present and flagged open.
		const open = await rowFor(vendorId);
		expect(open).toBeDefined();
		expect(open!.vendor.isOpenForOrders).toBe(true);
		expect(open!.listings.map((o) => o._id.toString())).toContain(
			listing._id.toString(),
		);

		await setVendorOpenForOrdersDB({
			id: vendorId,
			isOpenForOrders: false,
		});

		// Closed → still present (menu/prices/ratings stay browsable), but the
		// flag flips so the client can render the closed state. Ordering is
		// enforced by placeOrder, not by hiding the kitchen.
		const closed = await rowFor(vendorId);
		expect(closed).toBeDefined();
		expect(closed!.vendor.isOpenForOrders).toBe(false);
		expect(closed!.listings.map((o) => o._id.toString())).toContain(
			listing._id.toString(),
		);
	});

	it("sorts open kitchens above closed ones", async () => {
		const openVendor = await makeVendor();
		const closedVendor = await makeVendor();
		trackSlots(
			await makeActiveDailyOrder({
				vendorId: openVendor.vendorId,
				campusId: openVendor.campusId,
			}),
		);
		trackSlots(
			await makeActiveDailyOrder({
				vendorId: closedVendor.vendorId,
				campusId: closedVendor.campusId,
			}),
		);
		await setVendorOpenForOrdersDB({
			id: closedVendor.vendorId,
			isOpenForOrders: false,
		});

		// Same state (both fixtures are Lagos), so one grid contains both.
		const grid = await getMarketplace({ campusId: openVendor.campusId });
		const ids = grid.map((r) => r.vendor.id);
		const openIdx = ids.indexOf(openVendor.vendorId);
		const closedIdx = ids.indexOf(closedVendor.vendorId);
		expect(openIdx).toBeGreaterThanOrEqual(0);
		expect(closedIdx).toBeGreaterThanOrEqual(0);
		// Relative, not absolute: other fixtures share the state.
		expect(openIdx).toBeLessThan(closedIdx);
	});

	it("reports vendorOpen on the public listing response", async () => {
		const { vendorId, campusId } = await makeVendor();
		const listing = await makeActiveDailyOrder({ vendorId, campusId });
		trackSlots(listing);

		const openView = await getPublicDailyOrder({
			shareableToken: listing.shareableToken,
		});
		expect(openView.vendorOpen).toBe(true);

		await setVendorOpenForOrdersDB({
			id: vendorId,
			isOpenForOrders: false,
		});
		const closedView = await getPublicDailyOrder({
			shareableToken: listing.shareableToken,
		});
		expect(closedView.vendorOpen).toBe(false);
	});
});
