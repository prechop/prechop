import crypto from "node:crypto";
import mongooseLib from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PAYSTACK_SECRET_KEY } from "@/server/constants/environments";
import { generateOrderNumber } from "@/server/constants/orderNumber";
import { Redis } from "@/server/databases/redis";
import { listSnapshotsByVendorDB } from "@/server/models/analyticsSnapshots";
import {
	BuyerOrder,
	createBuyerOrderDB,
	getBuyerOrderByIdDB,
	setBuyerOrderStatusDB,
} from "@/server/models/buyerOrders";
import { DayOfWeek, FulfillmentType, OrderStatus } from "@/server/models/enums";
import { paystackProvider } from "@/server/providers/paystack";
import { rebuildDailySnapshots } from "@/server/services/analyticsJobs";
import { cancelOrderAsVendor } from "@/server/services/buyerOrders/cancel";
import {
	bulkEntriesSchema,
	dayOfWeekParamSchema,
	deleteEntrySchema,
	upsertEntrySchema,
} from "@/server/validators/timetable/validate";
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
		expect(paystackProvider.verifyWebhookSignature(`${body} `, sig)).toBe(
			false,
		);
		expect(paystackProvider.verifyWebhookSignature(body, undefined)).toBe(
			false,
		);
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
						selectedOptions: [],
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
						selectedOptions: [],
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
	// The snapshot day is an Africa/Lagos calendar day (UTC+1, no DST), NOT a UTC
	// day. Those two disagree for the hour 23:00–00:00 UTC, so every assertion
	// here sits on that seam: a UTC-based implementation puts these orders on the
	// wrong day and fails.
	//
	//   2026-03-08T23:00:00Z  ==  2026-03-09 00:00 Lagos  (first instant of 09/03)
	//   2026-03-09T22:59:59Z  ==  2026-03-09 23:59:59 Lagos (last instant)
	//
	// Reference sits on Lagos 10/03, so "yesterday" is the Lagos day 09/03 and
	// the window is [2026-03-08T23:00:00Z, 2026-03-09T23:00:00Z).
	const REFERENCE = new Date("2026-03-10T09:00:00.000Z");
	const LAGOS_DAY_START = new Date("2026-03-08T23:00:00.000Z");

	it("keys the day on Lagos midnight, not UTC midnight", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();

		const orderAt = async (
			createdAt: Date,
			status: OrderStatus,
			settlementKobo: number,
		) => {
			const order = await createBuyerOrderDB({
				payload: {
					orderNumber: generateOrderNumber(),
					dailyOrderId: oid(),
					vendorId,
					buyerId: buyer!._id.toString(),
					campusId,
					fulfillmentType: FulfillmentType.PICKUP,
					subtotalKobo: settlementKobo,
					deliveryFeeKobo: 0,
					platformFeeKobo: 0,
					totalKobo: settlementKobo,
					prechopCommissionKobo: 0,
					vendorSettlementKobo: settlementKobo,
					items: [
						{
							dailyOrderItemId: oid(),
							menuItemId: oid(),
							snapshotName: "Jollof",
							snapshotPriceKobo: settlementKobo,
							quantity: 1,
							subtotalKobo: settlementKobo,
							selectedOptions: [],
						},
					],
				},
			});
			await setBuyerOrderStatusDB({ id: order!._id.toString(), status });
			// createdAt is set by mongoose timestamps; only a raw write can place
			// an order at an exact instant.
			await BuyerOrder.collection.updateOne(
				{ _id: new mongooseLib.Types.ObjectId(order!._id) },
				{ $set: { createdAt } },
			);
			return order!._id.toString();
		};

		// Each order carries a distinct settlement so that revenue alone
		// identifies which window was used — the two candidate windows would
		// otherwise agree on the order COUNT purely by coincidence.
		//
		// Lagos 09/03 window is [08T23:00Z, 09T23:00Z); a UTC 09/03 window would
		// be [09T00:00Z, 10T00:00Z). Only two of these four orders are in both.

		// Lagos 08/03 23:59:59 — outside both windows.
		await orderAt(
			new Date("2026-03-08T22:59:59.999Z"),
			OrderStatus.COMPLETED,
			1000,
		);
		// Lagos 09/03 00:00:00 sharp — IN for Lagos, OUT for UTC.
		await orderAt(
			new Date("2026-03-08T23:00:00.000Z"),
			OrderStatus.COMPLETED,
			2000,
		);
		// Lagos 09/03 23:59:59 — in both.
		await orderAt(
			new Date("2026-03-09T22:59:59.999Z"),
			OrderStatus.COMPLETED,
			4000,
		);
		// Lagos 10/03 00:00:00 sharp — OUT for Lagos, IN for UTC.
		await orderAt(
			new Date("2026-03-09T23:00:00.000Z"),
			OrderStatus.COMPLETED,
			8000,
		);
		// A cancelled order mid-day, in both windows.
		await orderAt(
			new Date("2026-03-09T12:00:00.000Z"),
			OrderStatus.CANCELLED,
			5000,
		);

		const written = await rebuildDailySnapshots(REFERENCE);
		expect(written).toBeGreaterThanOrEqual(1);

		const snapshots = await listSnapshotsByVendorDB({ vendorId });
		expect(snapshots.length).toBe(1);
		const snapshot = snapshots[0];
		// The day key is Lagos midnight expressed in UTC — 23:00 the day before.
		// A UTC-day implementation would write 2026-03-09T00:00:00Z here.
		expect(snapshot.date.toISOString()).toBe(LAGOS_DAY_START.toISOString());
		expect(snapshot.totalOrders).toBe(3);
		expect(snapshot.completedOrders).toBe(2);
		expect(snapshot.cancelledOrders).toBe(1);
		// 2000 + 4000. A UTC window would total 12000 (4000 + 8000) — this is the
		// assertion that pins the boundary to Lagos rather than UTC.
		expect(snapshot.totalRevenueKobo).toBe(6000);
	});

	it("is safe to re-run for the same day (upsert, not duplicate)", async () => {
		// The cron can fire twice; a second pass must refresh the row in place
		// rather than double-count the day.
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
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
				prechopCommissionKobo: 12000,
				vendorSettlementKobo: 143000,
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
			},
		});
		await setBuyerOrderStatusDB({
			id: order!._id.toString(),
			status: OrderStatus.COMPLETED,
		});
		await BuyerOrder.collection.updateOne(
			{ _id: new mongooseLib.Types.ObjectId(order!._id) },
			{ $set: { createdAt: new Date("2026-03-09T12:00:00.000Z") } },
		);

		await rebuildDailySnapshots(REFERENCE);
		await rebuildDailySnapshots(REFERENCE);

		const snapshots = await listSnapshotsByVendorDB({ vendorId });
		expect(snapshots.length).toBe(1);
		expect(snapshots[0].totalOrders).toBe(1);
	});
});

describe("timetable validators", () => {
	it("validate the day param, upsert, bulk and delete schemas", () => {
		expect(
			dayOfWeekParamSchema.safeParse({ dayOfWeek: DayOfWeek.MONDAY })
				.success,
		).toBe(true);
		expect(
			dayOfWeekParamSchema.safeParse({ dayOfWeek: "FUNDAY" }).success,
		).toBe(false);
		const entry = {
			menuItemId: "m1",
			dayOfWeek: DayOfWeek.MONDAY,
			isOpen: true,
		};
		expect(upsertEntrySchema.safeParse(entry).success).toBe(true);
		expect(bulkEntriesSchema.safeParse({ entries: [entry] }).success).toBe(
			true,
		);
		expect(bulkEntriesSchema.safeParse({ entries: [] }).success).toBe(
			false,
		);
		expect(deleteEntrySchema.safeParse({ id: "x" }).success).toBe(true);
	});
});
