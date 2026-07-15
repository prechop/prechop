import mongooseLib from "mongoose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
	BuyerOrder,
	createBuyerOrderDB,
	markBuyerOrderPaidDB,
	setBuyerOrderStatusDB,
} from "@/server/models/buyerOrders";
import {
	DailyOrderStatus,
	DayOfWeek,
	FulfillmentType,
	OrderStatus,
	VendorStatus,
} from "@/server/models/enums";
import { upsertTimetableEntryDB } from "@/server/models/timetableEntries";
import { paystackProvider } from "@/server/providers/paystack";
import { getVendorAnalytics } from "@/server/services/analytics/getVendorAnalytics";
import { createDailyOrder } from "@/server/services/dailyOrders/create";
import { createDailyOrderFromTemplate } from "@/server/services/dailyOrders/fromTemplate";
import {
	getMarketplace,
	getMyDailyOrderById,
	getMyDailyOrders,
	getPublicDailyOrder,
} from "@/server/services/dailyOrders/queries";
import {
	cancelDailyOrder,
	closeDailyOrder,
} from "@/server/services/dailyOrders/status";
import { updateDailyOrder } from "@/server/services/dailyOrders/update";
import { invalidateSiteConfigsCache } from "@/server/services/siteConfigs/getSiteConfigs";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeMenuItem, makeVendor } from "../helpers/factories";

beforeAll(async () => {
	await connectTestDB();
	invalidateSiteConfigsCache();
	vi.spyOn(paystackProvider, "refund").mockResolvedValue({
		id: 1,
		status: "success",
		amount: 1000,
	});
});

afterAll(async () => {
	vi.restoreAllMocks();
	invalidateSiteConfigsCache();
	await dropAndDisconnect();
});

const futureISO = (ms: number) => new Date(Date.now() + ms).toISOString();

describe("createDailyOrder", () => {
	it("creates an ACTIVE listing from owned menu items", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const item = await makeMenuItem({ vendorId, campusId });
		const listing = await createDailyOrder({
			userId,
			input: {
				title: "Lunch",
				scheduledDate: futureISO(3_600_000),
				cutoffTime: futureISO(1_800_000),
				items: [{ menuItemId: item!._id.toString() }],
			},
		});
		expect(listing.status).toBe(DailyOrderStatus.ACTIVE);
		expect(listing.items[0].snapshotName).toBe("Jollof");
	});

	it("edits a listing while it has not yet opened for orders", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const item = await makeMenuItem({ vendorId, campusId });
		const draft = await createDailyOrder({
			userId,
			input: {
				title: "Draft Lunch",
				scheduledDate: futureISO(3_600_000),
				// Opens in 10 min → still editable now.
				availableFrom: futureISO(600_000),
				cutoffTime: futureISO(1_800_000),
				draft: true,
				items: [{ menuItemId: item!._id.toString() }],
			},
		});
		expect(draft.status).toBe(DailyOrderStatus.DRAFT);
		const updated = await updateDailyOrder({
			userId,
			orderId: draft._id.toString(),
			input: { title: "Renamed Draft" },
		});
		expect(updated.title).toBe("Renamed Draft");
	});

	it("locks editing once orders have opened", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const item = await makeMenuItem({ vendorId, campusId });
		const listing = await createDailyOrder({
			userId,
			input: {
				title: "Open now",
				scheduledDate: futureISO(3_600_000),
				// Opened a second ago → editing is closed.
				availableFrom: new Date(Date.now() - 1000).toISOString(),
				cutoffTime: futureISO(1_800_000),
				items: [{ menuItemId: item!._id.toString() }],
			},
		});
		await expect(
			updateDailyOrder({
				userId,
				orderId: listing._id.toString(),
				input: { title: "Too late" },
			}),
		).rejects.toThrow();
	});

	it("rejects edits from a non-active vendor", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const item = await makeMenuItem({ vendorId, campusId });
		const draft = await createDailyOrder({
			userId,
			input: {
				title: "Draft Lunch",
				scheduledDate: futureISO(3_600_000),
				availableFrom: futureISO(600_000),
				cutoffTime: futureISO(1_800_000),
				draft: true,
				items: [{ menuItemId: item!._id.toString() }],
			},
		});
		const stranger = await makeVendor();
		await expect(
			updateDailyOrder({
				userId: stranger.userId,
				orderId: draft._id.toString(),
				input: { title: "Not yours" },
			}),
		).rejects.toThrow();
	});

	it("rejects an inactive vendor and non-owned menu items", async () => {
		const inactive = await makeVendor({ status: VendorStatus.INCOMPLETE });
		await expect(
			createDailyOrder({
				userId: inactive.userId,
				input: {
					title: "x",
					scheduledDate: futureISO(1000),
					cutoffTime: futureISO(2000),
					items: [{ menuItemId: oid() }],
				},
			}),
		).rejects.toThrow();

		const active = await makeVendor();
		await expect(
			createDailyOrder({
				userId: active.userId,
				input: {
					title: "x",
					scheduledDate: futureISO(1000),
					cutoffTime: futureISO(2000),
					items: [{ menuItemId: oid() }], // not owned
				},
			}),
		).rejects.toThrow();
	});
});

describe("dailyOrders queries", () => {
	it("lists marketplace, public-by-token, mine and mine-by-id", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const item = await makeMenuItem({ vendorId, campusId });
		const listing = await createDailyOrder({
			userId,
			input: {
				title: "Lunch",
				scheduledDate: futureISO(3_600_000),
				cutoffTime: futureISO(1_800_000),
				items: [{ menuItemId: item!._id.toString() }],
			},
		});
		// The marketplace is a vendor-grouped grid: one row per kitchen, carrying
		// that kitchen's active public listings. It is state-scoped (every campus
		// in the buyer's state), so find our row rather than pinning a count.
		const market = await getMarketplace({ campusId });
		const row = market.find((r) => r.vendor.id === vendorId);
		expect(row).toBeDefined();
		expect(
			row!.listings.some(
				(o) => o._id.toString() === listing._id.toString(),
			),
		).toBe(true);

		const publicView = await getPublicDailyOrder({
			shareableToken: listing.shareableToken,
		});
		expect(publicView._id.toString()).toBe(listing._id.toString());

		const mine = await getMyDailyOrders({ userId });
		expect(mine.length).toBe(1);
		const byId = await getMyDailyOrderById({
			userId,
			orderId: listing._id.toString(),
		});
		expect(byId._id.toString()).toBe(listing._id.toString());

		await expect(
			getPublicDailyOrder({ shareableToken: "nope" }),
		).rejects.toThrow();
	});

	it("filters my listings by title and date range, scoped to me", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const item = await makeMenuItem({ vendorId, campusId });
		const menuItemId = item!._id.toString();

		await createDailyOrder({
			userId,
			input: {
				title: "Jollof Friday",
				scheduledDate: "2026-07-12T10:00:00.000Z",
				cutoffTime: futureISO(1_800_000),
				items: [{ menuItemId }],
			},
		});
		await createDailyOrder({
			userId,
			input: {
				title: "Rice Monday",
				scheduledDate: "2026-07-20T10:00:00.000Z",
				cutoffTime: futureISO(1_800_000),
				items: [{ menuItemId }],
			},
		});

		// Title search narrows to the matching listing only …
		const byTitle = await getMyDailyOrders({ userId, q: "jollof" });
		expect(byTitle.map((o) => o.title)).toEqual(["Jollof Friday"]);
		// … and everything returned belongs to the caller's vendor.
		expect(byTitle.every((o) => o.vendorId.toString() === vendorId)).toBe(
			true,
		);

		// Date range excludes the out-of-window listing.
		const byRange = await getMyDailyOrders({
			userId,
			from: new Date("2026-07-11T00:00:00Z"),
			to: new Date("2026-07-13T00:00:00Z"),
		});
		expect(byRange.map((o) => o.title)).toEqual(["Jollof Friday"]);
	});
});

describe("dailyOrders status transitions", () => {
	it("closes an ACTIVE listing", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const item = await makeMenuItem({ vendorId, campusId });
		const listing = await createDailyOrder({
			userId,
			input: {
				title: "Lunch",
				scheduledDate: futureISO(3_600_000),
				cutoffTime: futureISO(1_800_000),
				items: [{ menuItemId: item!._id.toString() }],
			},
		});
		const closed = await closeDailyOrder({
			userId,
			orderId: listing._id.toString(),
		});
		expect((closed as { status: string }).status).toBe(
			DailyOrderStatus.CLOSED,
		);
	});

	it("cancels a listing and reports the refund summary", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const item = await makeMenuItem({ vendorId, campusId });
		const listing = await createDailyOrder({
			userId,
			input: {
				title: "Lunch",
				scheduledDate: futureISO(3_600_000),
				cutoffTime: futureISO(1_800_000),
				items: [{ menuItemId: item!._id.toString() }],
			},
		});
		const res = await cancelDailyOrder({
			userId,
			orderId: listing._id.toString(),
		});
		expect(res.status).toBe(DailyOrderStatus.CANCELLED);
		expect(res.refund).toEqual({ refunded: 0, failed: 0 });
	});
});

describe("createDailyOrderFromTemplate", () => {
	it("builds a listing from today's open timetable entries", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const item = await makeMenuItem({ vendorId, campusId });
		const days = [
			DayOfWeek.SUNDAY,
			DayOfWeek.MONDAY,
			DayOfWeek.TUESDAY,
			DayOfWeek.WEDNESDAY,
			DayOfWeek.THURSDAY,
			DayOfWeek.FRIDAY,
			DayOfWeek.SATURDAY,
		];
		const today = days[new Date().getDay()];
		await upsertTimetableEntryDB({
			vendorId,
			menuItemId: item!._id.toString(),
			dayOfWeek: today,
			isOpen: true,
		});
		const listing = await createDailyOrderFromTemplate({
			userId,
			input: {
				title: "From Template",
				scheduledDate: futureISO(3_600_000),
				cutoffTime: futureISO(1_800_000),
			},
		});
		expect(listing.items.length).toBe(1);
		expect(listing.status).toBe(DailyOrderStatus.ACTIVE);
	});

	it("throws when nothing is scheduled today", async () => {
		const { userId } = await makeVendor();
		await expect(
			createDailyOrderFromTemplate({
				userId,
				input: {
					title: "x",
					scheduledDate: futureISO(1000),
					cutoffTime: futureISO(2000),
				},
			}),
		).rejects.toThrow();
	});
});

describe("getVendorAnalytics", () => {
	it("returns live completed earnings, completion rate and reviews", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		// A vendor's "revenue" is their settlement — what they are actually paid
		// after the platform commission — not the gross the buyer was charged.
		// `placeOrder` always computes these, so the fixture must too; an order
		// with settlement left at its 0 default is not a realistic order.
		const commissionOf = (totalKobo: number) =>
			Math.round(totalKobo * 0.08);
		const settlementOf = (totalKobo: number) =>
			totalKobo - commissionOf(totalKobo);

		const makeOrder = async (orderNumber: string, totalKobo: number) => {
			const order = await createBuyerOrderDB({
				payload: {
					orderNumber,
					dailyOrderId: oid(),
					vendorId,
					buyerId: oid(),
					campusId,
					fulfillmentType: FulfillmentType.PICKUP,
					subtotalKobo: totalKobo,
					deliveryFeeKobo: 0,
					platformFeeKobo: 0,
					totalKobo,
					prechopCommissionKobo: commissionOf(totalKobo),
					vendorSettlementKobo: settlementOf(totalKobo),
					items: [
						{
							dailyOrderItemId: oid(),
							menuItemId: oid(),
							snapshotName: "Rice",
							snapshotPriceKobo: totalKobo,
							quantity: 1,
							subtotalKobo: totalKobo,
							selectedOptions: [],
						},
					],
				},
			});
			if (!order) throw new Error("Failed to create buyer order");
			return order._id.toString();
		};
		for (const [number, total] of [
			["AOV-1", 1000],
			["AOV-2", 3000],
		] as const) {
			const id = await makeOrder(number, total);
			await markBuyerOrderPaidDB({ id });
			await setBuyerOrderStatusDB({
				id,
				status: OrderStatus.COMPLETED,
			});
		}
		await setBuyerOrderStatusDB({
			id: await makeOrder("AOV-CANCELLED", 9000),
			status: OrderStatus.CANCELLED,
		});
		const refundedId = await makeOrder("AOV-REFUNDED", 7000);
		await markBuyerOrderPaidDB({ id: refundedId });
		await setBuyerOrderStatusDB({
			id: refundedId,
			status: OrderStatus.REFUNDED,
		});

		// Only the two COMPLETED+paid orders count: 920 + 2760.
		const expectedRevenue = settlementOf(1000) + settlementOf(3000);
		expect(expectedRevenue).toBe(3680);

		const analytics = await getVendorAnalytics({ userId });
		expect(analytics.snapshots.length).toBe(1);
		expect(analytics.lifetime.completedOrders).toBe(2);
		// Settlement, not gross: the cancelled/refunded orders contribute nothing
		// and the platform's cut is excluded.
		expect(analytics.lifetime.totalRevenueKobo).toBe(expectedRevenue);
		expect(analytics.lifetime.totalVendorSettlementKobo).toBe(
			expectedRevenue,
		);
		expect(analytics.lifetime.totalCommissionKobo).toBe(
			commissionOf(1000) + commissionOf(3000),
		);
		// Gross food subtotal is tracked separately and still counts the full
		// buyer-facing price.
		expect(analytics.lifetime.totalFoodSubtotalKobo).toBe(4000);
		expect(analytics.lifetime.avgOrderValueKobo).toBe(
			Math.round(expectedRevenue / 2),
		);
		// 2 completed of 4 resolved (2 completed + cancelled + refunded).
		expect(analytics.lifetime.completionRate).toBe(50);
		expect(analytics.reviews).toEqual([]);
	});

	it("falls back to gross total for legacy orders with no settlement field", async () => {
		// Orders written before `vendorSettlementKobo` existed have no such field
		// at all (distinct from the modern default of 0). The aggregation's
		// $ifNull keeps those vendors' historical revenue visible rather than
		// silently reporting zero.
		const { userId, vendorId, campusId } = await makeVendor();
		const order = await createBuyerOrderDB({
			payload: {
				orderNumber: `LEGACY-${Date.now()}`,
				dailyOrderId: oid(),
				vendorId,
				buyerId: oid(),
				campusId,
				fulfillmentType: FulfillmentType.PICKUP,
				subtotalKobo: 5000,
				deliveryFeeKobo: 0,
				platformFeeKobo: 0,
				totalKobo: 5000,
				items: [
					{
						dailyOrderItemId: oid(),
						menuItemId: oid(),
						snapshotName: "Rice",
						snapshotPriceKobo: 5000,
						quantity: 1,
						subtotalKobo: 5000,
						selectedOptions: [],
					},
				],
			},
		});
		const id = order!._id.toString();
		await markBuyerOrderPaidDB({ id });
		await setBuyerOrderStatusDB({ id, status: OrderStatus.COMPLETED });
		// Strip the field to reproduce a genuinely pre-migration document; the
		// schema default would otherwise write 0 and mask the fallback.
		await BuyerOrder.collection.updateOne(
			{ _id: new mongooseLib.Types.ObjectId(id) },
			{ $unset: { vendorSettlementKobo: "" } },
		);

		const analytics = await getVendorAnalytics({ userId });
		expect(analytics.lifetime.completedOrders).toBe(1);
		expect(analytics.lifetime.totalRevenueKobo).toBe(5000);
	});

	it("throws for a non-vendor user", async () => {
		await expect(getVendorAnalytics({ userId: oid() })).rejects.toThrow();
	});
});
