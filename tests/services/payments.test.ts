import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PAYSTACK_SECRET_KEY } from "@/server/constants/environments";
import hash from "@/server/constants/hash";
import {
	generateOrderNumber,
	generatePaystackRef,
} from "@/server/constants/orderNumber";
import { Redis } from "@/server/databases/redis";
import {
	createBuyerOrderDB,
	getBuyerOrderByIdDB,
} from "@/server/models/buyerOrders";
import {
	FulfillmentType,
	OrderStatus,
	PaymentStatus,
} from "@/server/models/enums";
import { createPaymentDB, getPaymentByRefDB } from "@/server/models/payments";
import { paystackProvider } from "@/server/providers/paystack";
import { sweepAbandonedOrders } from "@/server/services/buyerOrders/sweepAbandoned";
import { handlePaystackWebhook } from "@/server/services/payments/handlePaystackWebhook";
import { refundBuyerOrder } from "@/server/services/payments/refundBuyerOrder";
import { invalidateSiteConfigsCache } from "@/server/services/siteConfigs/getSiteConfigs";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeVendor } from "../helpers/factories";

const slotKeys = new Set<string>();

beforeAll(async () => {
	await connectTestDB();
	invalidateSiteConfigsCache();
});

afterAll(async () => {
	vi.restoreAllMocks();
	invalidateSiteConfigsCache();
	if (slotKeys.size) await Redis.del(...slotKeys);
	await dropAndDisconnect();
});

function sign(rawBody: string): string {
	return crypto
		.createHmac("sha512", PAYSTACK_SECRET_KEY)
		.update(rawBody)
		.digest("hex");
}

async function seedPaidOrder(amountKobo = 155000) {
	const { vendorId, campusId } = await makeVendor();
	const buyerId = oid();
	const itemId = oid();
	slotKeys.add(`slot:reserved:${itemId}`);
	const ref = generatePaystackRef();
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
			totalKobo: amountKobo,
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
	await createPaymentDB({
		payload: {
			buyerOrderId: order!._id.toString(),
			buyerId,
			vendorId,
			paystackRef: ref,
			amountKobo,
			platformFeeKobo: 5000,
			vendorAmountKobo: 140000,
			idempotencyKey: hash(ref),
		},
	});
	return { order: order!, ref, amountKobo };
}

describe("handlePaystackWebhook", () => {
	it("rejects an invalid signature", async () => {
		await expect(
			handlePaystackWebhook({
				rawBody: JSON.stringify({ event: "charge.success" }),
				signature: "deadbeef",
			}),
		).rejects.toThrow();
	});

	it("ignores non charge.success events", async () => {
		const body = JSON.stringify({ event: "charge.failed", data: {} });
		const res = await handlePaystackWebhook({
			rawBody: body,
			signature: sign(body),
		});
		expect(res.received).toBe(true);
		expect(res.orderNumber).toBeUndefined();
	});

	it("processes a valid charge.success, marks paid, is idempotent", async () => {
		const { order, ref, amountKobo } = await seedPaidOrder();
		const body = JSON.stringify({
			event: "charge.success",
			data: {
				reference: ref,
				amount: amountKobo,
				channel: "card",
				status: "success",
			},
		});
		const res = await handlePaystackWebhook({
			rawBody: body,
			signature: sign(body),
		});
		expect(res.received).toBe(true);
		expect(res.orderNumber).toBe(order.orderNumber);

		const paid = await getBuyerOrderByIdDB({ id: order._id.toString() });
		expect(paid!.status).toBe(OrderStatus.PAID);
		const payment = await getPaymentByRefDB({ paystackRef: ref });
		expect(payment!.status).toBe(PaymentStatus.SUCCESS);
		expect(payment!.webhookVerified).toBe(true);

		// second delivery is a no-op
		const again = await handlePaystackWebhook({
			rawBody: body,
			signature: sign(body),
		});
		expect(again.received).toBe(true);
		expect(again.orderNumber).toBeUndefined();
	});

	it("rejects an amount mismatch", async () => {
		const { ref } = await seedPaidOrder(155000);
		const body = JSON.stringify({
			event: "charge.success",
			data: {
				reference: ref,
				amount: 999,
				channel: "card",
				status: "success",
			},
		});
		await expect(
			handlePaystackWebhook({ rawBody: body, signature: sign(body) }),
		).rejects.toThrow();
	});

	it("throws when the payment ref is unknown", async () => {
		const body = JSON.stringify({
			event: "charge.success",
			data: {
				reference: "PCH-UNKNOWN",
				amount: 1000,
				channel: "card",
				status: "success",
			},
		});
		await expect(
			handlePaystackWebhook({ rawBody: body, signature: sign(body) }),
		).rejects.toThrow();
	});
});

describe("refundBuyerOrder", () => {
	it("refunds via Paystack then flips order + payment to REFUNDED", async () => {
		const { order, ref } = await seedPaidOrder();
		const spy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({ id: 1, status: "success", amount: 155000 });
		await refundBuyerOrder({
			orderId: order._id.toString(),
			paystackRef: ref,
			amountKobo: 155000,
		});
		expect(spy).toHaveBeenCalled();
		const refunded = await getBuyerOrderByIdDB({
			id: order._id.toString(),
		});
		expect(refunded!.status).toBe(OrderStatus.REFUNDED);
		spy.mockRestore();
	});

	it("throws (surfaces) when Paystack refund fails", async () => {
		const { order, ref } = await seedPaidOrder();
		const spy = vi
			.spyOn(paystackProvider, "refund")
			.mockRejectedValue(new Error("paystack down"));
		await expect(
			refundBuyerOrder({
				orderId: order._id.toString(),
				paystackRef: ref,
				amountKobo: 155000,
			}),
		).rejects.toThrow();
		spy.mockRestore();
	});
});

describe("sweepAbandonedOrders", () => {
	it("cancels stale PENDING_PAYMENT orders", async () => {
		const { vendorId, campusId } = await makeVendor();
		const itemId = oid();
		slotKeys.add(`slot:reserved:${itemId}`);
		const order = await createBuyerOrderDB({
			payload: {
				orderNumber: generateOrderNumber(),
				dailyOrderId: oid(),
				vendorId,
				buyerId: oid(),
				campusId,
				fulfillmentType: FulfillmentType.PICKUP,
				subtotalKobo: 1000,
				deliveryFeeKobo: 0,
				platformFeeKobo: 5000,
				totalKobo: 6000,
				items: [
					{
						dailyOrderItemId: itemId,
						menuItemId: oid(),
						snapshotName: "X",
						snapshotPriceKobo: 1000,
						quantity: 1,
						subtotalKobo: 1000,
						addons: [],
					},
				],
			},
		});
		// backdate createdAt beyond the abandon window (default 15 min).
		// Use the native driver so Mongoose timestamp handling can't override it.
		const mongoose = (await import("mongoose")).default;
		const { BuyerOrder } = await import("@/server/models/buyerOrders");
		await BuyerOrder.collection.updateOne(
			{ _id: new mongoose.Types.ObjectId(order!._id) },
			{ $set: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } },
		);

		const cancelled = await sweepAbandonedOrders();
		expect(cancelled).toBeGreaterThanOrEqual(1);
		const swept = await getBuyerOrderByIdDB({ id: order!._id.toString() });
		expect(swept!.status).toBe(OrderStatus.CANCELLED);
	});
});
