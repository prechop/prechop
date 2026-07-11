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
// flow: a closed kitchen accepts no new orders (placeOrder rejects), its
// listings are hidden from the marketplace grid, and its public listing page
// reports vendorOpen=false so the client can show a closed state.

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

describe("closed vendors disappear from the buyer surface", () => {
	it("excludes a closed vendor's listing from the marketplace grid", async () => {
		const { vendorId, campusId } = await makeVendor();
		const listing = await makeActiveDailyOrder({ vendorId, campusId });
		trackSlots(listing);

		// Open → present.
		const open = await getMarketplace({ campusId });
		expect(open.map((o) => o._id.toString())).toContain(
			listing._id.toString(),
		);

		// Closed → gone.
		await setVendorOpenForOrdersDB({
			id: vendorId,
			isOpenForOrders: false,
		});
		const closed = await getMarketplace({ campusId });
		expect(closed.map((o) => o._id.toString())).not.toContain(
			listing._id.toString(),
		);
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
