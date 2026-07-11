import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateShareableToken } from "@/server/constants/orderNumber";
import { Redis } from "@/server/databases/redis";
import { getBuyerOrderByIdDB } from "@/server/models/buyerOrders";
import {
	createDailyOrderDB,
	getDailyOrderByIdDB,
	setDailyOrderStatusDB,
} from "@/server/models/dailyOrders";
import {
	DailyOrderStatus,
	FulfillmentType,
	MenuCategory,
} from "@/server/models/enums";
import { createMenuItemDB } from "@/server/models/menuItems";
import { createOptionGroupDB } from "@/server/models/optionGroups";
import {
	createVendorProfileDB,
	updateVendorProfileDB,
} from "@/server/models/vendorProfiles";
import { paystackProvider } from "@/server/providers/paystack";
import { placeOrder } from "@/server/services/buyerOrders/placeOrder";
import { buildSnapshotItems } from "@/server/services/dailyOrders/snapshot";
import { invalidateSiteConfigsCache } from "@/server/services/siteConfigs/getSiteConfigs";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";

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

async function vendorWithMenu(campusId: string) {
	const vendor = await createVendorProfileDB({
		payload: { userId: oid(), campusId, email: `v-${oid()}@t.test` },
	});
	const vendorId = vendor!._id.toString();
	await updateVendorProfileDB({
		id: vendorId,
		payload: {
			paystackSubaccountCode: "ACCT_test123",
			isOpenForOrders: true,
		},
	});
	return vendorId;
}

describe("buildSnapshotItems option groups", () => {
	it("auto-resolves a menu item's attached library groups", async () => {
		const campusId = oid();
		const vendorId = await vendorWithMenu(campusId);
		const group = await createOptionGroupDB({
			payload: {
				vendorId,
				campusId,
				name: "Protein",
				required: true,
				minSelect: 1,
				maxSelect: 1,
				options: [
					{ name: "Chicken", priceKobo: 50000 },
					{ name: "Beef", priceKobo: 60000 },
				],
			},
		});
		const item = await createMenuItemDB({
			payload: {
				vendorId,
				campusId,
				category: MenuCategory.MEALS,
				name: "Jollof",
				priceKobo: 150000,
				optionGroupIds: [group!._id.toString()],
			},
		});

		const [snap] = await buildSnapshotItems({
			vendorId,
			items: [{ menuItemId: item!._id.toString() }],
		});
		expect(snap.optionGroups).toHaveLength(1);
		expect(snap.optionGroups![0].sourceGroupId).toBe(group!._id.toString());
		expect(snap.optionGroups![0].required).toBe(true);
		expect(snap.optionGroups![0].options).toHaveLength(2);
		expect(snap.optionGroups![0].options[0].priceKobo).toBe(50000);
	});

	it("uses explicit composer-supplied groups (naira → kobo) over the library", async () => {
		const campusId = oid();
		const vendorId = await vendorWithMenu(campusId);
		const item = await createMenuItemDB({
			payload: {
				vendorId,
				campusId,
				category: MenuCategory.MEALS,
				name: "Rice",
				priceKobo: 100000,
			},
		});
		const [snap] = await buildSnapshotItems({
			vendorId,
			items: [
				{
					menuItemId: item!._id.toString(),
					optionGroups: [
						{
							name: "Extras",
							required: false,
							minSelect: 0,
							maxSelect: 2,
							options: [{ name: "Egg", priceNaira: 200 }],
						},
					],
				},
			],
		});
		expect(snap.optionGroups![0].options[0].priceKobo).toBe(20000);
	});
});

async function listingWithProtein(campusId: string) {
	const vendorId = await vendorWithMenu(campusId);
	const listing = await createDailyOrderDB({
		payload: {
			vendorId,
			campusId,
			shareableToken: generateShareableToken(),
			title: "Lunch",
			scheduledDate: new Date(Date.now() + 3_600_000),
			cutoffTime: new Date(Date.now() + 1_800_000),
			pickupAvailable: true,
			items: [
				{
					menuItemId: oid(),
					snapshotName: "Jollof",
					snapshotPriceKobo: 150000,
					snapshotPrepMin: 20,
					maxQuantity: 10,
					optionGroups: [
						{
							name: "Protein",
							required: true,
							minSelect: 1,
							maxSelect: 1,
							options: [
								{ name: "Chicken", priceKobo: 50000 },
								{ name: "Beef", priceKobo: 60000 },
							],
						},
					],
				},
			],
		},
	});
	await setDailyOrderStatusDB({
		id: listing!._id.toString(),
		vendorId,
		status: DailyOrderStatus.ACTIVE,
	});
	const fresh = await getDailyOrderByIdDB({ id: listing!._id.toString() });
	const item = fresh!.items[0];
	slotKeys.add(`slot:reserved:${item.id}`);
	return { listing: fresh!, item };
}

describe("placeOrder option validation", () => {
	it("rejects when a required group is not satisfied", async () => {
		const campusId = oid();
		const { listing, item } = await listingWithProtein(campusId);
		await expect(
			placeOrder({
				buyerId: oid(),
				campusId,
				input: {
					dailyOrderId: listing.id!,
					fulfillmentType: FulfillmentType.PICKUP,
					items: [{ dailyOrderItemId: item.id!, quantity: 1 }],
				},
			}),
		).rejects.toThrow(/choose/i);
	});

	it("rejects selecting more than maxSelect for a single-select group", async () => {
		const campusId = oid();
		const { listing, item } = await listingWithProtein(campusId);
		const optionIds = item.optionGroups[0].options.map((o) => o.id!);
		await expect(
			placeOrder({
				buyerId: oid(),
				campusId,
				input: {
					dailyOrderId: listing.id!,
					fulfillmentType: FulfillmentType.PICKUP,
					items: [
						{
							dailyOrderItemId: item.id!,
							quantity: 1,
							selectedOptionIds: optionIds,
						},
					],
				},
			}),
		).rejects.toThrow(/at most/i);
	});

	it("rejects an unknown option id", async () => {
		const campusId = oid();
		const { listing, item } = await listingWithProtein(campusId);
		await expect(
			placeOrder({
				buyerId: oid(),
				campusId,
				input: {
					dailyOrderId: listing.id!,
					fulfillmentType: FulfillmentType.PICKUP,
					items: [
						{
							dailyOrderItemId: item.id!,
							quantity: 1,
							selectedOptionIds: [
								item.optionGroups[0].options[0].id!,
								oid(),
							],
						},
					],
				},
			}),
		).rejects.toThrow();
	});

	it("accepts a valid selection and includes the option price in the total", async () => {
		const campusId = oid();
		const { listing, item } = await listingWithProtein(campusId);
		const chicken = item.optionGroups[0].options[0].id!;
		const result = await placeOrder({
			buyerId: oid(),
			campusId,
			input: {
				dailyOrderId: listing.id!,
				fulfillmentType: FulfillmentType.PICKUP,
				items: [
					{
						dailyOrderItemId: item.id!,
						quantity: 2,
						selectedOptionIds: [chicken],
					},
				],
			},
		});
		// (150000 base + 50000 chicken) * 2 = 400000 subtotal; + 5000 platform.
		expect(result.totalKobo).toBe(405000);
		const order = await getBuyerOrderByIdDB({ id: result.buyerOrderId });
		expect(order!.subtotalKobo).toBe(400000);
		expect(order!.items[0].selectedOptions[0].groupName).toBe("Protein");
		expect(order!.items[0].selectedOptions[0].snapshotName).toBe("Chicken");
		expect(order!.items[0].selectedOptions[0].subtotalKobo).toBe(100000);
	});
});
