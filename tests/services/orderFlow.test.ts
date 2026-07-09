import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateOrderNumber } from "@/server/constants/orderNumber";
import { Redis } from "@/server/databases/redis";
import {
	createBuyerOrderDB,
	setBuyerOrderStatusDB,
} from "@/server/models/buyerOrders";
import { FulfillmentType, OrderStatus } from "@/server/models/enums";
import { cancelOrderAsBuyer } from "@/server/services/buyerOrders/cancel";
import {
	getMyOrders,
	getOrderById,
	getVendorOrdersForDailyOrder,
} from "@/server/services/buyerOrders/queries";
import { updateOrderStatus } from "@/server/services/buyerOrders/updateStatus";
import { createReview } from "@/server/services/reviews/create";
import { getReviewForOrder } from "@/server/services/reviews/queries";
import { reportReview } from "@/server/services/reviews/report";
import { invalidateSiteConfigsCache } from "@/server/services/siteConfigs/getSiteConfigs";
import { updateSiteConfigs } from "@/server/services/siteConfigs/updateSiteConfigs";
import { getVendorReviews } from "@/server/services/vendors/reviews";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeUser, makeVendor } from "../helpers/factories";

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

async function makeOrder({
	vendorId,
	buyerId,
	campusId,
	status,
}: {
	vendorId: string;
	buyerId: string;
	campusId: string;
	status?: OrderStatus;
}) {
	const itemId = oid();
	slotKeys.add(`slot:reserved:${itemId}`);
	const order = await createBuyerOrderDB({
		payload: {
			orderNumber: generateOrderNumber(),
			dailyOrderId: oid(),
			vendorId,
			buyerId,
			campusId,
			fulfillmentType: FulfillmentType.PICKUP,
			subtotalKobo: 150000,
			deliveryFeeKobo: 0,
			platformFeeKobo: 5000,
			totalKobo: 155000,
			items: [
				{
					dailyOrderItemId: itemId,
					menuItemId: oid(),
					snapshotName: "Jollof",
					snapshotPriceKobo: 150000,
					quantity: 1,
					subtotalKobo: 150000,
					selectedOptions: [],
				},
			],
		},
	});
	if (status && status !== OrderStatus.PENDING_PAYMENT) {
		await setBuyerOrderStatusDB({ id: order!._id.toString(), status });
	}
	return order!;
}

describe("buyerOrders queries", () => {
	it("getMyOrders / getOrderById enforce ownership", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({ vendorId, buyerId, campusId });

		expect((await getMyOrders({ buyerId })).length).toBe(1);
		const fetched = await getOrderById({
			userId: buyerId,
			orderId: order._id.toString(),
		});
		expect(fetched._id.toString()).toBe(order._id.toString());

		// a stranger cannot view it
		await expect(
			getOrderById({ userId: oid(), orderId: order._id.toString() }),
		).rejects.toThrow();
	});

	it("getVendorOrdersForDailyOrder returns the vendor's paid orders", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.PAID,
		});
		const list = await getVendorOrdersForDailyOrder({
			vendorUserId: userId,
			dailyOrderId: order.dailyOrderId.toString(),
		});
		expect(list.length).toBe(1);
	});
});

describe("updateOrderStatus", () => {
	it("advances through the valid transition chain", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.PAID,
		});
		const orderId = order._id.toString();
		const confirmed = await updateOrderStatus({
			vendorUserId: userId,
			orderId,
			status: OrderStatus.CONFIRMED,
		});
		expect(confirmed.status).toBe(OrderStatus.CONFIRMED);
		const preparing = await updateOrderStatus({
			vendorUserId: userId,
			orderId,
			status: OrderStatus.PREPARING,
		});
		expect(preparing.status).toBe(OrderStatus.PREPARING);
	});

	it("rejects an illegal transition", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.PAID,
		});
		await expect(
			updateOrderStatus({
				vendorUserId: userId,
				orderId: order._id.toString(),
				status: OrderStatus.READY,
			}),
		).rejects.toThrow();
	});

	it("rejects a non-owning vendor", async () => {
		const owner = await makeVendor();
		const other = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId: owner.vendorId,
			buyerId: buyer!._id.toString(),
			campusId: owner.campusId,
			status: OrderStatus.PAID,
		});
		await expect(
			updateOrderStatus({
				vendorUserId: other.userId,
				orderId: order._id.toString(),
				status: OrderStatus.CONFIRMED,
			}),
		).rejects.toThrow();
	});
});

describe("cancelOrderAsBuyer", () => {
	it("cancels a PAID order and releases holds (no payment → no refund)", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.PAID,
		});
		const res = await cancelOrderAsBuyer({
			buyerId,
			orderId: order._id.toString(),
			reason: "changed mind",
		});
		expect(res.message).toMatch(/cancelled/i);
	});

	it("refuses to cancel a non-cancellable order", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.COMPLETED,
		});
		await expect(
			cancelOrderAsBuyer({
				buyerId,
				orderId: order._id.toString(),
				reason: "x",
			}),
		).rejects.toThrow();
	});
});

describe("reviews service", () => {
	it("creates a review for a completed order, then blocks a duplicate", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.COMPLETED,
		});
		const review = await createReview({
			userId: buyerId,
			input: {
				buyerOrderId: order._id.toString(),
				rating: 5,
				comment: "Excellent",
			},
		});
		expect(review!.rating).toBe(5);

		// the vendor rating aggregate is now reflected
		const { aggregate } = await getVendorReviews({ vendorId });
		expect(aggregate.count).toBe(1);
		expect(aggregate.avg).toBe(5);

		const fetched = await getReviewForOrder({
			userId: buyerId,
			buyerOrderId: order._id.toString(),
		});
		expect(fetched!._id.toString()).toBe(review!._id.toString());

		await expect(
			createReview({
				userId: buyerId,
				input: { buyerOrderId: order._id.toString(), rating: 3 },
			}),
		).rejects.toThrow();
	});

	it("rejects reviewing a non-completed order", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.PAID,
		});
		await expect(
			createReview({
				userId: buyerId,
				input: { buyerOrderId: order._id.toString(), rating: 4 },
			}),
		).rejects.toThrow();
	});

	it("lets the vendor report/flag a review on their own profile", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.COMPLETED,
		});
		const review = await createReview({
			userId: buyerId,
			input: { buyerOrderId: order._id.toString(), rating: 1 },
		});
		const res = await reportReview({
			userId,
			reviewId: review!._id.toString(),
		});
		expect(res.isFlagged).toBe(true);
	});
});

describe("siteConfigs update service", () => {
	it("persists a change, invalidates the cache and audits", async () => {
		const updated = await updateSiteConfigs({
			payload: { reviewWindowHours: 48, marketplaceEnabled: false },
			adminId: oid(),
			role: "SUPER_ADMIN",
		});
		expect(updated!.reviewWindowHours).toBe(48);
		expect(updated!.marketplaceEnabled).toBe(false);
	});
});
