import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	generateOrderNumber,
	generateShareableToken,
} from "@/server/constants";
import {
	createBuyerOrderDB,
	createDailyOrderDB,
	createMenuItemDB,
	createReviewDB,
	createVendorProfileDB,
	DailyOrderStatus,
	FulfillmentType,
	MenuCategory,
	markBuyerOrderPaidDB,
	setDailyOrderStatusDB,
	setVendorOpenForOrdersDB,
	setVendorStatusDB,
	VendorStatus,
} from "@/server/models";
import {
	getMarketplace,
	getVendorStorefront,
	searchMarketplace,
	updateDailyOrder,
} from "@/server/services/dailyOrders";
import { getUserAdminDetail } from "@/server/services/iam";
import { connectTestDB, dropAndDisconnect } from "../helpers/db";
import { makeCampus, makeUser } from "../helpers/factories";

beforeAll(async () => {
	await connectTestDB();
});
afterAll(async () => {
	await dropAndDisconnect();
});

/** A fully active, open vendor pinned to a campus, with a chosen business name. */
async function activeVendorOnCampus(campusId: string, businessName: string) {
	const user = await makeUser({ campusId });
	const userId = user!._id.toString();
	const profile = await createVendorProfileDB({
		payload: {
			userId,
			campusId,
			email: `v-${Math.random().toString(36).slice(2)}@prechop.test`,
			businessName,
		},
	});
	const vendorId = profile!._id.toString();
	await setVendorStatusDB({ id: vendorId, status: VendorStatus.ACTIVE });
	await setVendorOpenForOrdersDB({ id: vendorId, isOpenForOrders: true });
	return { userId, vendorId };
}

/** An ACTIVE, public, still-open listing with a given title + item name. */
async function activeListing({
	vendorId,
	campusId,
	title,
	itemName,
}: {
	vendorId: string;
	campusId: string;
	title: string;
	itemName: string;
}) {
	const listing = await createDailyOrderDB({
		payload: {
			vendorId,
			campusId,
			shareableToken: generateShareableToken(),
			title,
			scheduledDate: new Date(Date.now() + 3_600_000),
			cutoffTime: new Date(Date.now() + 1_800_000),
			pickupAvailable: true,
			items: [
				{
					menuItemId: (await makeCampus())!._id.toString(),
					snapshotName: itemName,
					snapshotPriceKobo: 150000,
					snapshotPrepMin: 20,
					maxQuantity: 10,
				},
			],
		},
	});
	await setDailyOrderStatusDB({
		id: listing!._id.toString(),
		vendorId,
		status: DailyOrderStatus.ACTIVE,
	});
	return listing!;
}

describe("getMarketplace — same-state scope", () => {
	it("includes listings from another campus in the same state, excludes other states", async () => {
		const lagosA = await makeCampus({ state: "Lagos" });
		const lagosB = await makeCampus({ state: "Lagos" });
		const oyo = await makeCampus({ state: "Oyo" });
		const campusA = lagosA!._id.toString();
		const campusB = lagosB!._id.toString();
		const campusOyo = oyo!._id.toString();

		const vA = await activeVendorOnCampus(campusA, "Ada Kitchen");
		const vB = await activeVendorOnCampus(campusB, "Bola Buka");
		const vO = await activeVendorOnCampus(campusOyo, "Ibadan Bites");
		const lA = await activeListing({
			vendorId: vA.vendorId,
			campusId: campusA,
			title: "A lunch",
			itemName: "Jollof",
		});
		const lB = await activeListing({
			vendorId: vB.vendorId,
			campusId: campusB,
			title: "B lunch",
			itemName: "Amala",
		});
		const lO = await activeListing({
			vendorId: vO.vendorId,
			campusId: campusOyo,
			title: "O lunch",
			itemName: "Ewa",
		});

		const seenFromA = await getMarketplace({ campusId: campusA });
		const listings = seenFromA.flatMap((row) => row.listings);
		const ids = listings.map((o) => o._id.toString());
		// Same state (Lagos) — both A and B surface.
		expect(ids).toContain(lA._id.toString());
		expect(ids).toContain(lB._id.toString());
		// Different state (Oyo) — hidden.
		expect(ids).not.toContain(lO._id.toString());
		// Each card carries the shop name.
		const cardB = seenFromA.find((row) => row.vendor.id === vB.vendorId);
		expect(cardB?.vendor.businessName).toBe("Bola Buka");
	});
});

describe("searchMarketplace — comprehensive lookup", () => {
	it("matches by shop name, menu item, and listing, scoped to the state", async () => {
		const campus = await makeCampus({ state: "Lagos" });
		const campusId = campus!._id.toString();
		const vendor = await activeVendorOnCampus(
			campusId,
			"Mama Nkechi Specials",
		);
		await createMenuItemDB({
			payload: {
				vendorId: vendor.vendorId,
				campusId,
				category: MenuCategory.MEALS,
				name: "Ofada Rice Deluxe",
				priceKobo: 250000,
			},
		});
		await activeListing({
			vendorId: vendor.vendorId,
			campusId,
			title: "Weekend Banga Fiesta",
			itemName: "Banga Soup",
		});

		const byShop = await searchMarketplace({ campusId, q: "Nkechi" });
		expect(byShop.some((h) => h.vendor.id === vendor.vendorId)).toBe(true);
		expect(
			byShop.find((h) => h.vendor.id === vendor.vendorId)?.matchedOn,
		).toContain("shop");

		const byMenu = await searchMarketplace({ campusId, q: "Ofada" });
		expect(
			byMenu.find((h) => h.vendor.id === vendor.vendorId)?.matchedOn,
		).toContain("menu");

		const byListing = await searchMarketplace({ campusId, q: "Banga" });
		const hit = byListing.find((h) => h.vendor.id === vendor.vendorId);
		expect(hit?.matchedOn).toContain("listing");
		// The listing "close data" (cutoff) rides along with each hit.
		expect(hit?.listings.length).toBeGreaterThan(0);
		expect(hit?.listings[0].cutoffTime).toBeTruthy();

		// A nonsense term returns nothing.
		expect(
			await searchMarketplace({ campusId, q: "zzznotathing" }),
		).toEqual([]);
	});
});

describe("getVendorStorefront", () => {
	it("returns the vendor, active listings and full menu; rejects inactive vendors", async () => {
		const campus = await makeCampus({ state: "Lagos" });
		const campusId = campus!._id.toString();
		const vendor = await activeVendorOnCampus(campusId, "Storefront Shop");
		await createMenuItemDB({
			payload: {
				vendorId: vendor.vendorId,
				campusId,
				category: MenuCategory.MEALS,
				name: "Signature Plate",
				priceKobo: 300000,
			},
		});
		await activeListing({
			vendorId: vendor.vendorId,
			campusId,
			title: "Today's Special",
			itemName: "Egusi",
		});

		const store = await getVendorStorefront({ vendorId: vendor.vendorId });
		expect(store.vendor.businessName).toBe("Storefront Shop");
		expect(store.listings.length).toBe(1);
		expect(store.menu.length).toBe(1);
		// No payout secrets leak into the public projection.
		expect(store.vendor).not.toHaveProperty("accountNumber");
		expect(store.vendor).not.toHaveProperty("email");

		// A PENDING (non-active) vendor is not a public storefront.
		const pending = await activeVendorOnCampus(campusId, "Hidden Shop");
		await setVendorStatusDB({
			id: pending.vendorId,
			status: VendorStatus.PENDING_REVIEW,
		});
		await expect(
			getVendorStorefront({ vendorId: pending.vendorId }),
		).rejects.toBeTruthy();
	});
});

describe("updateDailyOrder — close date can be today or future", () => {
	it("accepts a cutoff after the menu date and still accepts a same-day one", async () => {
		const campus = await makeCampus({ state: "Lagos" });
		const campusId = campus!._id.toString();
		const vendor = await activeVendorOnCampus(campusId, "Edit Kitchen");
		const menuDay = new Date(Date.now() + 2 * 86_400_000); // 2 days out
		menuDay.setUTCHours(0, 0, 0, 0);
		const listing = await createDailyOrderDB({
			payload: {
				vendorId: vendor.vendorId,
				campusId,
				shareableToken: generateShareableToken(),
				title: "Editable",
				scheduledDate: menuDay,
				availableFrom: new Date(Date.now() + 3_600_000), // opens in 1h (still editable)
				cutoffTime: new Date(menuDay.getTime() + 12 * 3_600_000),
				pickupAvailable: true,
				items: [
					{
						menuItemId: (await makeCampus())!._id.toString(),
						snapshotName: "Rice",
						snapshotPriceKobo: 150000,
						snapshotPrepMin: 20,
						maxQuantity: 10,
					},
				],
			},
		});
		await setDailyOrderStatusDB({
			id: listing!._id.toString(),
			vendorId: vendor.vendorId,
			status: DailyOrderStatus.ACTIVE,
		});
		const orderId = listing!._id.toString();

		// A cutoff the day AFTER the menu date is accepted; the client only
		// blocks close dates before the start, not future menu windows.
		const futureClose = await updateDailyOrder({
			userId: vendor.userId,
			orderId,
			input: {
				cutoffTime: new Date(
					menuDay.getTime() + 30 * 3_600_000,
				).toISOString(),
			},
		});
		expect(futureClose).toBeTruthy();

		// A same-day cutoff is accepted.
		const updated = await updateDailyOrder({
			userId: vendor.userId,
			orderId,
			input: {
				cutoffTime: new Date(
					menuDay.getTime() + 20 * 3_600_000,
				).toISOString(),
			},
		});
		expect(updated).toBeTruthy();
	});
});

describe("getUserAdminDetail", () => {
	it("composes identity, order analytics and written reviews", async () => {
		const campus = await makeCampus({ state: "Lagos" });
		const campusId = campus!._id.toString();
		const buyer = await makeUser({ campusId });
		const buyerId = buyer!._id.toString();
		const vendor = await activeVendorOnCampus(campusId, "Reviewed Kitchen");
		const listing = await activeListing({
			vendorId: vendor.vendorId,
			campusId,
			title: "Detail lunch",
			itemName: "Rice",
		});

		// One paid order for the buyer …
		const order = await createBuyerOrderDB({
			payload: {
				orderNumber: generateOrderNumber(),
				dailyOrderId: listing._id.toString(),
				vendorId: vendor.vendorId,
				buyerId,
				campusId,
				fulfillmentType: FulfillmentType.PICKUP,
				subtotalKobo: 150000,
				deliveryFeeKobo: 0,
				platformFeeKobo: 5000,
				totalKobo: 155000,
				items: [
					{
						dailyOrderItemId: listing.items[0]._id!.toString(),
						menuItemId: listing.items[0].menuItemId.toString(),
						snapshotName: "Rice",
						snapshotPriceKobo: 150000,
						quantity: 1,
						subtotalKobo: 150000,
						selectedOptions: [],
					},
				],
			},
		});
		await markBuyerOrderPaidDB({
			id: order!._id.toString(),
			channel: "card",
		});
		// … and a review they wrote.
		await createReviewDB({
			payload: {
				buyerOrderId: order!._id.toString(),
				vendorId: vendor.vendorId,
				buyerId,
				rating: 5,
				comment: "Great!",
			},
		});

		const detail = await getUserAdminDetail(buyerId);
		expect(detail.user.id).toBe(buyerId);
		expect(detail.user.campusName).toBeTruthy();
		expect(detail.orders.total).toBe(1);
		expect(detail.orders.totalSpentKobo).toBe(155000);
		expect(detail.orders.byStatus.PAID).toBe(1);
		expect(detail.reviewsWritten.count).toBe(1);
		expect(detail.reviewsWritten.recent[0].rating).toBe(5);
	});
});
