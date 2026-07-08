import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PAYSTACK_SECRET_KEY } from "@/server/constants/environments";
import { generateOrderNumber } from "@/server/constants/orderNumber";
import { Redis } from "@/server/databases/redis";
import { FulfillmentType, OrderStatus } from "@/server/models/enums";
import {
	createBuyerOrderDB,
	getBuyerOrderByIdDB,
	setBuyerOrderStatusDB,
} from "@/server/models/buyerOrders";
import { paystackProvider } from "@/server/providers/paystack";
import { cancelOrderAsVendor } from "@/server/services/buyerOrders/cancel";
import { rebuildDailySnapshots } from "@/server/services/analyticsJobs";
import {
	bulkEntriesSchema,
	dayOfWeekParamSchema,
	deleteEntrySchema,
	upsertEntrySchema,
} from "@/server/validators/timetable/validate";
import { DayOfWeek } from "@/server/models/enums";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeUser, makeVendor } from "../helpers/factories";

const slotKeys = new Set<string>();

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	if (slotKeys.size) await Redis.del(...slotKeys);
	await dropAndDisconnect();
});

describe("paystack verifyWebhookSignature", () => {
	it("accepts a correctly-signed body and rejects tampering / missing header", () => {
		const body = JSON.stringify({ event: "charge.success" });
		const sig = crypto
			.createHmac("sha512", PAYSTACK_SECRET_KEY)
			.update(body)
			.digest("hex");
		expect(paystackProvider.verifyWebhookSignature(body, sig)).toBe(true);
		expect(
			paystackProvider.verifyWebhookSignature(`${body} `, sig),
		).toBe(false);
		expect(
			paystackProvider.verifyWebhookSignature(body, undefined),
		).toBe(false);
		// wrong-length hex signature
		expect(paystackProvider.verifyWebhookSignature(body, "abcd")).toBe(
			false,
		);
	});
});

describe("cancelOrderAsVendor", () => {
	it("cancels the vendor's own PAID order (SMS is fire-and-forget)", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const itemId = oid();
		slotKeys.add(`slot:reserved:${itemId}`);
		const order = await createBuyerOrderDB({
			payload: {
				orderNumber: generateOrderNumber(),
				dailyOrderId: oid(),
				vendorId,
				buyerId: buyer!._id.toString(),
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
						addons: [],
					},
				],
			},
		});
		await setBuyerOrderStatusDB({
			id: order!._id.toString(),
			status: OrderStatus.PAID,
		});
		const res = await cancelOrderAsVendor({
			vendorUserId: userId,
			orderId: order!._id.toString(),
			reason: "Out of stock",
		});
		expect(res.message).toMatch(/cancelled/i);
		const cancelled = await getBuyerOrderByIdDB({
			id: order!._id.toString(),
		});
		expect(cancelled!.status).toBe(OrderStatus.CANCELLED);
		expect(cancelled!.cancelledBy).toBe("vendor");
	});

	it("rejects a non-owning vendor", async () => {
		const owner = await makeVendor();
		const other = await makeVendor();
		const buyer = await makeUser();
		const itemId = oid();
		slotKeys.add(`slot:reserved:${itemId}`);
		const order = await createBuyerOrderDB({
			payload: {
				orderNumber: generateOrderNumber(),
				dailyOrderId: oid(),
				vendorId: owner.vendorId,
				buyerId: buyer!._id.toString(),
				campusId: owner.campusId,
				fulfillmentType: FulfillmentType.PICKUP,
				subtotalKobo: 1,
				deliveryFeeKobo: 0,
				platformFeeKobo: 5000,
				totalKobo: 5001,
				items: [
					{
						dailyOrderItemId: itemId,
						menuItemId: oid(),
						snapshotName: "X",
						snapshotPriceKobo: 1,
						quantity: 1,
						subtotalKobo: 1,
						addons: [],
					},
				],
			},
		});
		await setBuyerOrderStatusDB({
			id: order!._id.toString(),
			status: OrderStatus.PAID,
		});
		await expect(
			cancelOrderAsVendor({
				vendorUserId: other.userId,
				orderId: order!._id.toString(),
				reason: "x",
			}),
		).rejects.toThrow();
	});
});

describe("rebuildDailySnapshots (analytics job)", () => {
	it("aggregates yesterday's orders into per-vendor snapshots", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		// an order dated within yesterday's window
		const now = new Date();
		const to = new Date(
			Date.UTC(
				now.getUTCFullYear(),
				now.getUTCMonth(),
				now.getUTCDate(),
			),
		);
		const yesterdayNoon = new Date(to.getTime() - 12 * 60 * 60 * 1000);

		const order = await createBuyerOrderDB({
			payload: {
				orderNumber: generateOrderNumber(),
				dailyOrderId: oid(),
				vendorId,
				buyerId: buyer!._id.toString(),
				campusId,
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
						addons: [],
					},
				],
			},
		});
		await setBuyerOrderStatusDB({
			id: order!._id.toString(),
			status: OrderStatus.COMPLETED,
		});
		const mongoose = (await import("mongoose")).default;
		const { BuyerOrder } = await import("@/server/models/buyerOrders");
		await BuyerOrder.collection.updateOne(
			{ _id: new mongoose.Types.ObjectId(order!._id) },
			{ $set: { createdAt: yesterdayNoon } },
		);

		const written = await rebuildDailySnapshots(now);
		expect(written).toBeGreaterThanOrEqual(1);
	});
});

describe("timetable validators", () => {
	it("validate the day param, upsert, bulk and delete schemas", () => {
		expect(
			dayOfWeekParamSchema.safeParse({ dayOfWeek: DayOfWeek.MONDAY })
				.success,
		).toBe(true);
		expect(dayOfWeekParamSchema.safeParse({ dayOfWeek: "FUNDAY" }).success).toBe(
			false,
		);
		const entry = {
			menuItemId: "m1",
			dayOfWeek: DayOfWeek.MONDAY,
			isOpen: true,
		};
		expect(upsertEntrySchema.safeParse(entry).success).toBe(true);
		expect(
			bulkEntriesSchema.safeParse({ entries: [entry] }).success,
		).toBe(true);
		expect(bulkEntriesSchema.safeParse({ entries: [] }).success).toBe(false);
		expect(deleteEntrySchema.safeParse({ id: "x" }).success).toBe(true);
	});
});
