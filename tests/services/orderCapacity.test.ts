import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateOrderNumber } from "@/server/constants/orderNumber";
import { Redis } from "@/server/databases/redis";
import {
	createBuyerOrderDB,
	decrementDailyOrderItemQuantityDB,
	getDailyOrderByIdDB,
	incrementDailyOrderItemQuantityDB,
	setBuyerOrderStatusDB,
} from "@/server/models";
import { FulfillmentType, OrderStatus } from "@/server/models/enums";
import {
	cancelOrderAsBuyer,
	cancelOrderAsVendor,
} from "@/server/services/buyerOrders/cancel";
import { invalidateSiteConfigsCache } from "@/server/services/siteConfigs/getSiteConfigs";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import {
	makeActiveDailyOrder,
	makeUser,
	makeVendor,
} from "../helpers/factories";

// Capacity accounting across the settled-order lifecycle. A daily-order item's
// `orderedQuantity` (Mongo) tracks capacity consumed by PAID/CONFIRMED orders;
// the Redis `slot:reserved:*` counter tracks only in-flight PENDING_PAYMENT
// holds. Cancelling a *settled* order must return its units to orderedQuantity
// and must NOT touch the reserved counter (which never held them) — otherwise
// the freed capacity is stranded (under-sell) and the reserved counter is
// corrupted (oversell for concurrent buyers).

const slotKeys = new Set<string>();

beforeAll(async () => {
	await connectTestDB();
	invalidateSiteConfigsCache();
});

afterAll(async () => {
	invalidateSiteConfigsCache();
	if (slotKeys.size) await Redis.del(...slotKeys);
	await dropAndDisconnect();
});

async function firstItemId(dailyOrderId: string): Promise<string> {
	const d = await getDailyOrderByIdDB({ id: dailyOrderId });
	// biome-ignore lint/style/noNonNullAssertion: seeded listing always has an item
	const item = d!.items[0] as unknown as { id?: string; _id?: unknown };
	return (item.id ?? item._id)?.toString() ?? "";
}

async function orderedQty(
	dailyOrderId: string,
	itemId: string,
): Promise<number> {
	const d = await getDailyOrderByIdDB({ id: dailyOrderId });
	const item = (d?.items ?? []).find(
		(i) =>
			(
				(i as unknown as { id?: string; _id?: unknown }).id ??
				(i as unknown as { _id?: unknown })._id
			)?.toString() === itemId,
	) as unknown as { orderedQuantity: number } | undefined;
	return item?.orderedQuantity ?? -1;
}

/** A PAID order tied to `listing`, with its capacity already committed to the
 *  listing's orderedQuantity (as the payment webhook would have done). */
async function settledOrder({
	listing,
	vendorId,
	buyerId,
	campusId,
	quantity,
	status,
}: {
	listing: { _id: unknown; items: unknown[] };
	vendorId: string;
	buyerId: string;
	campusId: string;
	quantity: number;
	status: OrderStatus;
}) {
	const dailyOrderId = (listing._id as { toString(): string }).toString();
	const dailyOrderItemId = await firstItemId(dailyOrderId);
	slotKeys.add(`slot:reserved:${dailyOrderItemId}`);
	const order = await createBuyerOrderDB({
		payload: {
			orderNumber: generateOrderNumber(),
			dailyOrderId,
			vendorId,
			buyerId,
			campusId,
			fulfillmentType: FulfillmentType.PICKUP,
			subtotalKobo: 150000 * quantity,
			deliveryFeeKobo: 0,
			platformFeeKobo: 5000,
			totalKobo: 150000 * quantity + 5000,
			items: [
				{
					dailyOrderItemId,
					menuItemId: oid(),
					snapshotName: "Jollof",
					snapshotPriceKobo: 150000,
					quantity,
					subtotalKobo: 150000 * quantity,
					selectedOptions: [],
				},
			],
		},
	});
	// biome-ignore lint/style/noNonNullAssertion: create always returns the doc here
	await setBuyerOrderStatusDB({ id: order!._id.toString(), status });
	// Payment webhook commits the capacity into orderedQuantity.
	await incrementDailyOrderItemQuantityDB({
		dailyOrderId,
		dailyOrderItemId,
		by: quantity,
	});
	// biome-ignore lint/style/noNonNullAssertion: create always returns the doc here
	return { order: order!, dailyOrderId, dailyOrderItemId };
}

describe("cancelling a settled order returns its capacity", () => {
	it("buyer cancel of a PAID order frees the item's orderedQuantity", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const listing = await makeActiveDailyOrder({
			vendorId,
			campusId,
			maxQuantity: 5,
		});
		const { order, dailyOrderId, dailyOrderItemId } = await settledOrder({
			listing,
			vendorId,
			buyerId,
			campusId,
			quantity: 3,
			status: OrderStatus.PAID,
		});
		expect(await orderedQty(dailyOrderId, dailyOrderItemId)).toBe(3);

		await cancelOrderAsBuyer({
			buyerId,
			orderId: order._id.toString(),
			reason: "changed mind",
		});

		// The 3 units are returned to the pool — not stranded as phantom sales.
		expect(await orderedQty(dailyOrderId, dailyOrderItemId)).toBe(0);
		// The reserved counter never held this settled order, so it is untouched.
		expect(await Redis.get(`slot:reserved:${dailyOrderItemId}`)).toBeNull();
	});

	it("vendor cancel of a CONFIRMED order also frees capacity", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const listing = await makeActiveDailyOrder({
			vendorId,
			campusId,
			maxQuantity: 8,
		});
		const { order, dailyOrderId, dailyOrderItemId } = await settledOrder({
			listing,
			vendorId,
			buyerId,
			campusId,
			quantity: 4,
			status: OrderStatus.CONFIRMED,
		});
		expect(await orderedQty(dailyOrderId, dailyOrderItemId)).toBe(4);

		await cancelOrderAsVendor({
			vendorUserId: userId,
			orderId: order._id.toString(),
			reason: "kitchen closed",
		});

		expect(await orderedQty(dailyOrderId, dailyOrderItemId)).toBe(0);
		expect(await Redis.get(`slot:reserved:${dailyOrderItemId}`)).toBeNull();
	});

	it("clamps orderedQuantity at 0 — an over-decrement never goes negative", async () => {
		const { vendorId, campusId } = await makeVendor();
		const listing = await makeActiveDailyOrder({
			vendorId,
			campusId,
			maxQuantity: 10,
		});
		const dailyOrderId = listing._id.toString();
		const itemId = await firstItemId(dailyOrderId);

		await incrementDailyOrderItemQuantityDB({
			dailyOrderId,
			dailyOrderItemId: itemId,
			by: 2,
		});
		// Return more than is committed (double call / drift): must floor at 0,
		// never go negative — a negative would inflate availability and oversell.
		await decrementDailyOrderItemQuantityDB({
			dailyOrderId,
			dailyOrderItemId: itemId,
			by: 5,
		});
		expect(await orderedQty(dailyOrderId, itemId)).toBe(0);
	});
});
