// "Order Again" — the read-only preview that tells a buyer whether a past order
// can be repeated today and at what price. It maps yesterday's menuItemId to
// today's listing item and re-resolves per-listing option ids, logic a client
// cannot compute. Nothing is mocked: real vendor, real listings, real buyer
// orders in the scratch DB, so a regression in the outcome precedence actually
// fails here.
//
// The module lives at services/dailyOrders/reorderPreview.ts (0% coverage at
// baseline).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateShareableToken } from "@/server/constants/orderNumber";
import {
	createBuyerOrderDB,
	createDailyOrderDB,
	DailyOrderStatus,
	FulfillmentType,
	getDailyOrderByIdDB,
	OrderStatus,
	setDailyOrderStatusDB,
	setVendorOpenForOrdersDB,
	setVendorStatusDB,
	VendorStatus,
} from "@/server/models";
import { getReorderPreview as dailyOrdersPreview } from "@/server/services/dailyOrders/reorderPreview";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeVendor } from "../helpers/factories";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

const HOUR = 60 * 60 * 1000;

interface ListingOpts {
	vendorId: string;
	campusId: string;
	menuItemId: string;
	priceKobo?: number;
	maxQuantity?: number | null;
	cutoffFromNowMs?: number;
	availableFromMs?: number | null;
	optionGroup?: { name: string; options: string[] };
	isPublic?: boolean;
	status?: DailyOrderStatus;
}

/** Build a listing with a single item keyed on `menuItemId`, then set its status. */
async function makeListing(o: ListingOpts) {
	const listing = await createDailyOrderDB({
		payload: {
			vendorId: o.vendorId,
			campusId: o.campusId,
			shareableToken: generateShareableToken(),
			title: "Lunch",
			scheduledDate: new Date(Date.now() + HOUR),
			availableFrom:
				o.availableFromMs != null
					? new Date(Date.now() + o.availableFromMs)
					: undefined,
			cutoffTime: new Date(Date.now() + (o.cutoffFromNowMs ?? HOUR)),
			pickupAvailable: true,
			isPublic: o.isPublic ?? true,
			items: [
				{
					menuItemId: o.menuItemId,
					snapshotName: "Jollof",
					snapshotPriceKobo: o.priceKobo ?? 150000,
					snapshotPrepMin: 20,
					maxQuantity: o.maxQuantity ?? 10,
					optionGroups: o.optionGroup
						? [
								{
									name: o.optionGroup.name,
									required: false,
									minSelect: 0,
									maxSelect: null,
									options: o.optionGroup.options.map(
										(name) => ({
											name,
											priceKobo: 20000,
										}),
									),
								},
							]
						: [],
				},
			],
		},
	});
	await setDailyOrderStatusDB({
		id: listing!._id.toString(),
		vendorId: o.vendorId,
		status: o.status ?? DailyOrderStatus.ACTIVE,
	});
	return listing!;
}

interface OrderOpts {
	buyerId: string;
	vendorId: string;
	campusId: string;
	menuItemId: string;
	dailyOrderId: string;
	priceKobo?: number;
	selectedOptions?: { groupName: string; snapshotName: string }[];
}

/** A completed buyer order to reorder from. */
async function makePastOrder(o: OrderOpts) {
	const order = await createBuyerOrderDB({
		payload: {
			orderNumber: `PC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
			dailyOrderId: o.dailyOrderId,
			vendorId: o.vendorId,
			buyerId: o.buyerId,
			campusId: o.campusId,
			status: OrderStatus.COMPLETED,
			fulfillmentType: FulfillmentType.PICKUP,
			subtotalKobo: o.priceKobo ?? 150000,
			deliveryFeeKobo: 0,
			platformFeeKobo: 0,
			totalKobo: o.priceKobo ?? 150000,
			items: [
				{
					dailyOrderItemId: oid(),
					menuItemId: o.menuItemId,
					snapshotName: "Jollof",
					snapshotPriceKobo: o.priceKobo ?? 150000,
					quantity: 1,
					subtotalKobo: o.priceKobo ?? 150000,
					selectedOptions: (o.selectedOptions ?? []).map((s) => ({
						groupName: s.groupName,
						snapshotName: s.snapshotName,
						snapshotPriceKobo: 20000,
						quantity: 1,
						subtotalKobo: 20000,
					})),
				},
			],
		} as never,
	});
	return order!;
}

const variants: [string, typeof dailyOrdersPreview][] = [
	["dailyOrders/reorderPreview", dailyOrdersPreview],
];

for (const [label, getReorderPreview] of variants) {
	describe(`getReorderPreview (${label})`, () => {
		it("throws for an unknown order", async () => {
			await expect(
				getReorderPreview({ userId: oid(), buyerOrderId: oid() }),
			).rejects.toThrow();
		});

		it("forbids a buyer reordering someone else's order", async () => {
			const { vendorId, campusId } = await makeVendor();
			const menuItemId = oid();
			const listing = await makeListing({
				vendorId,
				campusId,
				menuItemId,
			});
			const order = await makePastOrder({
				buyerId: oid(),
				vendorId,
				campusId,
				menuItemId,
				dailyOrderId: listing._id.toString(),
			});
			await expect(
				getReorderPreview({
					userId: oid(), // NOT the buyer
					buyerOrderId: order._id.toString(),
				}),
			).rejects.toThrow();
		});

		it("VENDOR_GONE when the vendor is no longer ACTIVE", async () => {
			const { vendorId, campusId } = await makeVendor();
			const menuItemId = oid();
			const listing = await makeListing({
				vendorId,
				campusId,
				menuItemId,
			});
			const buyerId = oid();
			const order = await makePastOrder({
				buyerId,
				vendorId,
				campusId,
				menuItemId,
				dailyOrderId: listing._id.toString(),
			});
			await setVendorStatusDB({
				id: vendorId,
				status: VendorStatus.SUSPENDED,
			});

			const res = await getReorderPreview({
				userId: buyerId,
				buyerOrderId: order._id.toString(),
			});
			expect(res.outcome).toBe("VENDOR_GONE");
			expect(res.items).toEqual([]);
		});

		it("VENDOR_CLOSED when the kitchen master switch is off", async () => {
			const { vendorId, campusId } = await makeVendor();
			const menuItemId = oid();
			const listing = await makeListing({
				vendorId,
				campusId,
				menuItemId,
			});
			const buyerId = oid();
			const order = await makePastOrder({
				buyerId,
				vendorId,
				campusId,
				menuItemId,
				dailyOrderId: listing._id.toString(),
			});
			await setVendorOpenForOrdersDB({
				id: vendorId,
				isOpenForOrders: false,
			});

			const res = await getReorderPreview({
				userId: buyerId,
				buyerOrderId: order._id.toString(),
			});
			expect(res.outcome).toBe("VENDOR_CLOSED");
		});

		it("NO_LISTING when the vendor has nothing published", async () => {
			const { vendorId, campusId } = await makeVendor();
			const menuItemId = oid();
			const buyerId = oid();
			const order = await makePastOrder({
				buyerId,
				vendorId,
				campusId,
				menuItemId,
				dailyOrderId: oid(), // a listing that no longer exists
			});

			const res = await getReorderPreview({
				userId: buyerId,
				buyerOrderId: order._id.toString(),
			});
			expect(res.outcome).toBe("NO_LISTING");
		});

		it("NOT_STARTED when today's listing hasn't opened for orders yet", async () => {
			const { vendorId, campusId } = await makeVendor();
			const menuItemId = oid();
			const listing = await makeListing({
				vendorId,
				campusId,
				menuItemId,
				availableFromMs: HOUR, // opens in an hour
				cutoffFromNowMs: 3 * HOUR,
			});
			const buyerId = oid();
			const order = await makePastOrder({
				buyerId,
				vendorId,
				campusId,
				menuItemId,
				dailyOrderId: listing._id.toString(),
			});

			const res = await getReorderPreview({
				userId: buyerId,
				buyerOrderId: order._id.toString(),
			});
			expect(res.outcome).toBe("NOT_STARTED");
			expect(res.target?.dailyOrderId).toBe(listing._id.toString());
			expect(res.nextListingDate).toBeTruthy();
		});

		it("LISTING_CLOSED when every listing is past its cutoff", async () => {
			const { vendorId, campusId } = await makeVendor();
			const menuItemId = oid();
			const listing = await makeListing({
				vendorId,
				campusId,
				menuItemId,
				cutoffFromNowMs: -HOUR, // cutoff already passed
			});
			const buyerId = oid();
			const order = await makePastOrder({
				buyerId,
				vendorId,
				campusId,
				menuItemId,
				dailyOrderId: listing._id.toString(),
			});

			const res = await getReorderPreview({
				userId: buyerId,
				buyerOrderId: order._id.toString(),
			});
			expect(res.outcome).toBe("LISTING_CLOSED");
		});

		it("ALL_AVAILABLE when everything is orderable at the same price", async () => {
			const { vendorId, campusId } = await makeVendor();
			const menuItemId = oid();
			const listing = await makeListing({
				vendorId,
				campusId,
				menuItemId,
				priceKobo: 150000,
			});
			const buyerId = oid();
			const order = await makePastOrder({
				buyerId,
				vendorId,
				campusId,
				menuItemId,
				dailyOrderId: listing._id.toString(),
				priceKobo: 150000,
			});

			const res = await getReorderPreview({
				userId: buyerId,
				buyerOrderId: order._id.toString(),
			});
			expect(res.outcome).toBe("ALL_AVAILABLE");
			expect(res.items).toHaveLength(1);
			expect(res.items[0].status).toBe("AVAILABLE");
			expect(res.items[0].currentPriceKobo).toBe(150000);
			expect(res.target?.dailyOrderId).toBe(listing._id.toString());
		});

		it("PRICE_CHANGED when the item is available but the price moved", async () => {
			const { vendorId, campusId } = await makeVendor();
			const menuItemId = oid();
			const listing = await makeListing({
				vendorId,
				campusId,
				menuItemId,
				priceKobo: 180000, // dearer today
			});
			const buyerId = oid();
			const order = await makePastOrder({
				buyerId,
				vendorId,
				campusId,
				menuItemId,
				dailyOrderId: listing._id.toString(),
				priceKobo: 150000, // paid less last time
			});

			const res = await getReorderPreview({
				userId: buyerId,
				buyerOrderId: order._id.toString(),
			});
			expect(res.outcome).toBe("PRICE_CHANGED");
			expect(res.items[0].previousPriceKobo).toBe(150000);
			expect(res.items[0].currentPriceKobo).toBe(180000);
		});

		it("PARTIAL (REMOVED) when the vendor isn't cooking the item today", async () => {
			const { vendorId, campusId } = await makeVendor();
			const orderedItem = oid();
			const differentItem = oid();
			// Today's listing carries a DIFFERENT menu item.
			const listing = await makeListing({
				vendorId,
				campusId,
				menuItemId: differentItem,
			});
			const buyerId = oid();
			const order = await makePastOrder({
				buyerId,
				vendorId,
				campusId,
				menuItemId: orderedItem,
				dailyOrderId: listing._id.toString(),
			});

			const res = await getReorderPreview({
				userId: buyerId,
				buyerOrderId: order._id.toString(),
			});
			expect(res.outcome).toBe("PARTIAL");
			expect(res.items[0].status).toBe("REMOVED");
		});

		it("PARTIAL (SOLD_OUT) when the item is listed but capped out", async () => {
			const { vendorId, campusId } = await makeVendor();
			const menuItemId = oid();
			const listing = await makeListing({
				vendorId,
				campusId,
				menuItemId,
				maxQuantity: 5,
			});
			// Drive orderedQuantity to the cap through the raw driver — createDailyOrderDB
			// forces orderedQuantity to 0, and the sold-out branch is what we're pinning.
			const mongoose = (await import("mongoose")).default;
			await mongoose.connection
				.db!.collection("dailyorders")
				.updateOne(
					{ _id: new mongoose.Types.ObjectId(listing._id) },
					{ $set: { "items.0.orderedQuantity": 5 } },
				);
			const buyerId = oid();
			const order = await makePastOrder({
				buyerId,
				vendorId,
				campusId,
				menuItemId,
				dailyOrderId: listing._id.toString(),
			});

			const res = await getReorderPreview({
				userId: buyerId,
				buyerOrderId: order._id.toString(),
			});
			expect(res.outcome).toBe("PARTIAL");
			expect(res.items[0].status).toBe("SOLD_OUT");
			expect(res.items[0].currentPriceKobo).toBe(150000);
		});

		it("remaps a still-present option and reports ALL_AVAILABLE", async () => {
			const { vendorId, campusId } = await makeVendor();
			const menuItemId = oid();
			const listing = await makeListing({
				vendorId,
				campusId,
				menuItemId,
				optionGroup: { name: "Protein", options: ["Chicken", "Beef"] },
			});
			const buyerId = oid();
			const order = await makePastOrder({
				buyerId,
				vendorId,
				campusId,
				menuItemId,
				dailyOrderId: listing._id.toString(),
				selectedOptions: [
					{ groupName: "Protein", snapshotName: "Chicken" },
				],
			});

			const res = await getReorderPreview({
				userId: buyerId,
				buyerOrderId: order._id.toString(),
			});
			expect(res.outcome).toBe("ALL_AVAILABLE");
			// The old option id re-resolved to today's Chicken option, nothing dropped.
			expect(res.items[0].selectedOptionIds).toHaveLength(1);
			expect(res.items[0].droppedOptionNames).toBeUndefined();
		});

		it("PARTIAL when a previously-selected option no longer exists", async () => {
			const { vendorId, campusId } = await makeVendor();
			const menuItemId = oid();
			// Today's Protein group dropped "Beef".
			const listing = await makeListing({
				vendorId,
				campusId,
				menuItemId,
				optionGroup: { name: "Protein", options: ["Chicken"] },
			});
			const buyerId = oid();
			const order = await makePastOrder({
				buyerId,
				vendorId,
				campusId,
				menuItemId,
				dailyOrderId: listing._id.toString(),
				selectedOptions: [
					{ groupName: "Protein", snapshotName: "Beef" },
				],
			});

			const res = await getReorderPreview({
				userId: buyerId,
				buyerOrderId: order._id.toString(),
			});
			expect(res.outcome).toBe("PARTIAL");
			expect(res.items[0].droppedOptionNames).toContain("Beef");
		});

		it("tolerates a deleted previous listing (option index falls back to order names)", async () => {
			const { vendorId, campusId } = await makeVendor();
			const menuItemId = oid();
			const listing = await makeListing({
				vendorId,
				campusId,
				menuItemId,
				optionGroup: { name: "Protein", options: ["Chicken"] },
			});
			const buyerId = oid();
			// dailyOrderId points at a listing that no longer exists — indexPreviousOptions
			// returns an empty map and the name fallback on the order line is used.
			const order = await makePastOrder({
				buyerId,
				vendorId,
				campusId,
				menuItemId,
				dailyOrderId: oid(),
				selectedOptions: [
					{ groupName: "Protein", snapshotName: "Chicken" },
				],
			});
			// Sanity: the previous listing really is gone.
			expect(
				await getDailyOrderByIdDB({
					id: order.dailyOrderId.toString(),
				}),
			).toBeNull();

			const res = await getReorderPreview({
				userId: buyerId,
				buyerOrderId: order._id.toString(),
			});
			expect(res.outcome).toBe("ALL_AVAILABLE");
			expect(res.items[0].selectedOptionIds).toHaveLength(1);
		});
	});
}
