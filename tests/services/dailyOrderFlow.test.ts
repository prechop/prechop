import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { upsertAnalyticsSnapshotDB } from "@/server/models/analyticsSnapshots";
import {
	DailyOrderStatus,
	DayOfWeek,
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
		const market = await getMarketplace({ campusId });
		expect(market.length).toBe(1);

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
	it("returns snapshots + lifetime totals", async () => {
		const { userId, vendorId } = await makeVendor();
		await upsertAnalyticsSnapshotDB({
			vendorId,
			date: new Date("2026-07-01"),
			payload: { totalOrders: 3, totalRevenueKobo: 300000 },
		});
		const analytics = await getVendorAnalytics({ userId });
		expect(analytics.snapshots.length).toBe(1);
		expect(analytics.lifetime).toHaveProperty("rating");
	});

	it("throws for a non-vendor user", async () => {
		await expect(getVendorAnalytics({ userId: oid() })).rejects.toThrow();
	});
});
