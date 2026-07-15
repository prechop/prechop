// Regression: a late `charge.success` that settles money at Paystack AFTER the
// abandoned-order sweep has already CANCELLED the order (and marked its payment
// ABANDONED, but left `webhookVerified:false`). `claimPaymentWebhookDB` still
// matches the late webhook, so the payment flips to SUCCESS — but the order is
// no longer payable. The webhook must NOT commit capacity or send a
// confirmation, and must refund the buyer in full, leaving a `refunds` row as
// the reconciliation trail.
//
// Only the Paystack boundary is mocked; payments, orders, refunds, vendors and
// notifications are exercised against the real scratch database.

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
	createPaymentDB,
	FulfillmentType,
	getBuyerOrderByIdDB,
	getPaymentByRefDB,
	getRefundByPaymentIdDB,
	getVendorProfileByIdDB,
	listNotificationsDB,
	OrderStatus,
	PaymentStatus,
} from "@/server/models";
import { paystackProvider } from "@/server/providers";
import { sweepAbandonedOrders } from "@/server/services/buyerOrders/sweepAbandoned";
import { handlePaystackWebhook } from "@/server/services/payments/handlePaystackWebhook";
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

/** A PENDING_PAYMENT order with an unverified payment behind it. */
async function seedPendingOrder(amountKobo = 155000) {
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
					selectedOptions: [],
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
	return { order: order!, ref, amountKobo, vendorId, buyerId };
}

describe("handlePaystackWebhook — late settlement on a cancelled order", () => {
	it("refunds in full, commits no capacity, and sends no confirmation", async () => {
		const amountKobo = 155000;
		const { order, ref, vendorId, buyerId } =
			await seedPendingOrder(amountKobo);

		// Drive the exact bug sequence: the abandoned-order sweep cancels the
		// unpaid order and marks the payment ABANDONED (webhookVerified stays
		// false). Backdate createdAt past the abandon window via the native driver
		// so Mongoose timestamp handling can't override it.
		const mongoose = (await import("mongoose")).default;
		const { BuyerOrder } = await import("@/server/models/buyerOrders");
		await BuyerOrder.collection.updateOne(
			{ _id: new mongoose.Types.ObjectId(order._id) },
			{ $set: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } },
		);
		const cancelled = await sweepAbandonedOrders();
		expect(cancelled).toBeGreaterThanOrEqual(1);

		const swept = await getBuyerOrderByIdDB({ id: order._id.toString() });
		expect(swept!.status).toBe(OrderStatus.CANCELLED);
		const abandonedPayment = await getPaymentByRefDB({ paystackRef: ref });
		expect(abandonedPayment!.status).toBe(PaymentStatus.ABANDONED);
		expect(abandonedPayment!.webhookVerified).toBe(false);

		// The late webhook arrives and settles money at Paystack.
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({
				id: 42,
				status: "success",
				amount: amountKobo,
			});

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
		// The webhook still acknowledges (200) — never confirms an order number.
		expect(res.received).toBe(true);
		expect(res.orderNumber).toBeUndefined();

		// (c) A refund row exists for the FULL amount, and Paystack was asked to
		// pay it back against the payment's own reference.
		expect(refundSpy).toHaveBeenCalledTimes(1);
		expect(refundSpy).toHaveBeenCalledWith(ref, amountKobo);
		const settledPayment = await getPaymentByRefDB({ paystackRef: ref });
		const refund = await getRefundByPaymentIdDB({
			paymentId: settledPayment!._id.toString(),
		});
		expect(refund).not.toBeNull();
		expect(refund!.amountKobo).toBe(amountKobo);
		expect(refund!.paystackRefundId).toBe("42");

		// (a) Capacity was NOT committed: the vendor's order count never moved.
		const vendor = await getVendorProfileByIdDB({ id: vendorId });
		expect(vendor!.totalOrders).toBe(0);

		// (b) No buyer confirmation notification was written.
		const notifications = await listNotificationsDB({ userId: buyerId });
		expect(notifications).toHaveLength(0);

		// The order was never resurrected into PAID.
		const after = await getBuyerOrderByIdDB({ id: order._id.toString() });
		expect(after!.status).not.toBe(OrderStatus.PAID);

		refundSpy.mockRestore();
	});
});
