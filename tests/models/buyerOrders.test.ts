import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateOrderNumber } from "@/server/constants/orderNumber";
import {
	countBuyerOrdersDB,
	createBuyerOrderDB,
	deleteBuyerOrderHardDB,
	getBuyerOrderByIdDB,
	getBuyerOrderByNumberDB,
	listBuyerOrdersByBuyerDB,
	markBuyerOrderCancelledDB,
	markBuyerOrderPaidDB,
	markBuyerOrderRefundedDB,
	setBuyerOrderStatusDB,
} from "@/server/models/buyerOrders";
import { FulfillmentType, OrderStatus } from "@/server/models/enums";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

function makePayload(overrides: Record<string, unknown> = {}) {
	return {
		orderNumber: generateOrderNumber(),
		dailyOrderId: oid(),
		vendorId: oid(),
		buyerId: oid(),
		campusId: oid(),
		fulfillmentType: FulfillmentType.PICKUP,
		subtotalKobo: 150000,
		deliveryFeeKobo: 0,
		platformFeeKobo: 5000,
		totalKobo: 155000,
		items: [
			{
				dailyOrderItemId: oid(),
				menuItemId: oid(),
				snapshotName: "Jollof",
				snapshotPriceKobo: 150000,
				quantity: 1,
				subtotalKobo: 150000,
				selectedOptions: [],
			},
		],
		...overrides,
	};
}

describe("buyerOrders model", () => {
	it("creates with a pre-generated id and PENDING_PAYMENT default", async () => {
		const id = new mongoose.Types.ObjectId().toString();
		const order = await createBuyerOrderDB({ id, payload: makePayload() });
		expect(order).not.toBeNull();
		expect(order!._id.toString()).toBe(id);
		expect(order!.status).toBe(OrderStatus.PENDING_PAYMENT);

		const byId = await getBuyerOrderByIdDB({ id });
		expect(byId!.id).toBe(id);
		const byNum = await getBuyerOrderByNumberDB({
			orderNumber: order!.orderNumber,
		});
		expect(byNum!._id.toString()).toBe(id);
	});

	it("marks paid only from PENDING_PAYMENT (idempotent guard)", async () => {
		const order = await createBuyerOrderDB({ payload: makePayload() });
		const id = order!._id.toString();
		const paid = await markBuyerOrderPaidDB({ id, channel: "card" });
		expect(paid!.status).toBe(OrderStatus.AWAITING_VENDOR_ACCEPTANCE);
		expect(paid!.paidAt).toBeTruthy();
		expect(paid!.acceptanceDeadline).toBeTruthy();
		// second call finds no PENDING_PAYMENT doc → null
		const again = await markBuyerOrderPaidDB({ id, channel: "card" });
		expect(again).toBeNull();
	});

	it("sets status with a fromStatuses guard", async () => {
		const order = await createBuyerOrderDB({ payload: makePayload() });
		const id = order!._id.toString();
		await markBuyerOrderPaidDB({ id });
		const confirmed = await setBuyerOrderStatusDB({
			id,
			status: OrderStatus.CONFIRMED,
			fromStatuses: [OrderStatus.AWAITING_VENDOR_ACCEPTANCE],
		});
		expect(confirmed!.status).toBe(OrderStatus.CONFIRMED);
		// wrong precondition
		const blocked = await setBuyerOrderStatusDB({
			id,
			status: OrderStatus.READY,
			fromStatuses: [OrderStatus.PENDING_PAYMENT],
		});
		expect(blocked).toBeNull();
	});

	it("cancels and refunds", async () => {
		const order = await createBuyerOrderDB({ payload: makePayload() });
		const id = order!._id.toString();
		const cancelled = await markBuyerOrderCancelledDB({
			id,
			reason: "changed mind",
			cancelledBy: "buyer",
		});
		expect(cancelled!.status).toBe(OrderStatus.CANCELLED);
		expect(cancelled!.cancelledBy).toBe("buyer");

		const paidOrder = await createBuyerOrderDB({ payload: makePayload() });
		const pid = paidOrder!._id.toString();
		expect(await markBuyerOrderRefundedDB({ id: pid })).toBe(true);
		const refunded = await getBuyerOrderByIdDB({ id: pid });
		expect(refunded!.status).toBe(OrderStatus.REFUNDED);
	});

	it("lists by buyer and hard-deletes (compensation)", async () => {
		const buyerId = oid();
		await createBuyerOrderDB({ payload: makePayload({ buyerId }) });
		const list = await listBuyerOrdersByBuyerDB({ buyerId });
		expect(list.length).toBe(1);

		const doomed = await createBuyerOrderDB({ payload: makePayload() });
		const did = doomed!._id.toString();
		await deleteBuyerOrderHardDB({ id: did });
		expect(await getBuyerOrderByIdDB({ id: did })).toBeNull();

		expect(await countBuyerOrdersDB()).toBeGreaterThan(0);
	});
});
