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
	createDailyOrderDB,
	createPaymentDB,
	FulfillmentType,
	getBuyerOrderByIdDB,
	getDailyOrderByIdDB,
	getPaymentByRefDB,
	getRefundByPaymentIdDB,
	getVendorProfileByIdDB,
	listNotificationsDB,
	OrderStatus,
	PaymentStatus,
} from "@/server/models";
import { paystackProvider } from "@/server/providers";
import { sendchampProvider } from "@/server/providers/sendchamp";
import { sweepAbandonedOrders } from "@/server/services/buyerOrders/sweepAbandoned";
import { handlePaystackWebhook } from "@/server/services/payments/handlePaystackWebhook";
import { issueRefund } from "@/server/services/refunds";
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
	const { userId: vendorUserId, vendorId, campusId } = await makeVendor();
	const buyerId = oid();
	const menuItemId = oid();
	const listing = await createDailyOrderDB({
		payload: {
			vendorId,
			campusId,
			shareableToken: `tok_${Math.random().toString(36).slice(2)}`,
			title: "Lunch",
			scheduledDate: new Date(Date.now() + 3_600_000),
			cutoffTime: new Date(Date.now() + 1_800_000),
			pickupAvailable: true,
			items: [
				{
					menuItemId,
					snapshotName: "Jollof",
					snapshotPriceKobo: 150000,
					snapshotPrepMin: 20,
					maxQuantity: 10,
				},
			],
		},
	});
	const savedListing = await getDailyOrderByIdDB({
		id: listing!._id.toString(),
	});
	const itemId = savedListing!.items[0].id ?? savedListing!.items[0]._id!;
	slotKeys.add(`slot:reserved:${itemId}`);
	const ref = generatePaystackRef();
	const order = await createBuyerOrderDB({
		payload: {
			orderNumber: generateOrderNumber(),
			dailyOrderId: listing!._id.toString(),
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
					menuItemId,
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
	return { order: order!, ref, amountKobo, vendorId, vendorUserId, buyerId };
}

describe("handlePaystackWebhook — late settlement on a cancelled order", () => {
	it("creates the new paid order alert for the vendor account user", async () => {
		const { order, ref, amountKobo, vendorId, vendorUserId, buyerId } =
			await seedPendingOrder();
		const smsSpy = vi
			.spyOn(sendchampProvider, "sendVendorNewOrder")
			.mockResolvedValue();

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

		expect(res).toEqual({ received: true, orderNumber: order.orderNumber });

		const vendorNotifications = await listNotificationsDB({
			userId: vendorUserId,
		});
		expect(vendorNotifications).toHaveLength(1);
		expect(vendorNotifications[0]).toMatchObject({
			title: "New paid order",
			type: "ORDER_PAID",
			dedupeKey: `order:${order.orderNumber}:vendor:paid`,
		});
		expect(vendorNotifications[0].userId.toString()).toBe(vendorUserId);

		const profileNotifications = await listNotificationsDB({
			userId: vendorId,
		});
		expect(profileNotifications).toHaveLength(0);

		const buyerNotifications = await listNotificationsDB({
			userId: buyerId,
		});
		expect(
			buyerNotifications.some(
				(n) => n.type === "ORDER_PAID_AWAITING_VENDOR",
			),
		).toBe(true);

		await handlePaystackWebhook({
			rawBody: body,
			signature: sign(body),
		});
		expect(
			await listNotificationsDB({
				userId: vendorUserId,
			}),
		).toHaveLength(1);

		smsSpy.mockRestore();
	});

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
				status: "pending",
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
		expect(refund!.status).toBe("REFUND_PENDING");
		expect(refund!.processedAt).toBeFalsy();
		expect(settledPayment!.status).toBe(PaymentStatus.SUCCESS);

		// (a) Capacity was NOT committed: the vendor's order count never moved.
		const vendor = await getVendorProfileByIdDB({ id: vendorId });
		expect(vendor!.totalOrders).toBe(0);

		// (b) No buyer confirmation notification was written.
		const notifications = await listNotificationsDB({ userId: buyerId });
		expect(notifications).toHaveLength(0);

		// The order was never resurrected into PAID and remains awaiting Paystack
		// confirmation rather than being prematurely marked REFUNDED.
		const after = await getBuyerOrderByIdDB({ id: order._id.toString() });
		expect(after!.status).toBe(OrderStatus.REFUND_PENDING);

		const processedBody = JSON.stringify({
			event: "refund.processed",
			data: {
				id: 42,
				status: "processed",
				amount: amountKobo,
				currency: "NGN",
				domain: "test",
				transaction: { reference: ref },
			},
		});
		await handlePaystackWebhook({
			rawBody: processedBody,
			signature: sign(processedBody),
		});
		expect(
			(await getBuyerOrderByIdDB({ id: order._id.toString() }))!.status,
		).toBe(OrderStatus.REFUNDED);
		expect((await getPaymentByRefDB({ paystackRef: ref }))!.status).toBe(
			PaymentStatus.REFUNDED,
		);

		// A duplicate charge webhook reuses the same logical refund and does not
		// submit another Paystack refund.
		await handlePaystackWebhook({ rawBody: body, signature: sign(body) });
		expect(refundSpy).toHaveBeenCalledTimes(1);

		refundSpy.mockRestore();
	});

	it("maps every Paystack refund lifecycle event without early completion", async () => {
		const { order, ref, amountKobo } = await seedPendingOrder();
		const mongoose = (await import("mongoose")).default;
		const { BuyerOrder } = await import("@/server/models/buyerOrders");
		const { Payment } = await import("@/server/models/payments");
		await BuyerOrder.collection.updateOne(
			{ _id: new mongoose.Types.ObjectId(order._id) },
			{ $set: { status: OrderStatus.PAID } },
		);
		await Payment.collection.updateOne(
			{ paystackRef: ref },
			{ $set: { status: PaymentStatus.SUCCESS, webhookVerified: true } },
		);
		vi.spyOn(paystackProvider, "refund").mockResolvedValue({
			id: 84,
			status: "pending",
			amount: amountKobo,
		});
		await issueRefund({
			orderId: order._id.toString(),
			amountKobo,
			reason: "lifecycle test",
		});

		const sendRefundEvent = async (status: string) => {
			const body = JSON.stringify({
				event: `refund.${status}`,
				data: {
					id: 84,
					status,
					amount: amountKobo,
					currency: "NGN",
					domain: "test",
					transaction: { reference: ref },
				},
			});
			await handlePaystackWebhook({
				rawBody: body,
				signature: sign(body),
			});
		};

		await sendRefundEvent("pending");
		expect(
			(await getBuyerOrderByIdDB({ id: order._id.toString() }))!.status,
		).toBe(OrderStatus.REFUND_PENDING);
		await sendRefundEvent("processing");
		expect(
			(await getBuyerOrderByIdDB({ id: order._id.toString() }))!.status,
		).toBe(OrderStatus.REFUND_PROCESSING);
		await sendRefundEvent("needs-attention");
		let payment = await getPaymentByRefDB({ paystackRef: ref });
		let refund = await getRefundByPaymentIdDB({
			paymentId: payment!._id.toString(),
		});
		expect(refund!.status).toBe("REFUND_NEEDS_ATTENTION");
		expect(payment!.status).toBe(PaymentStatus.SUCCESS);
		await sendRefundEvent("failed");
		refund = await getRefundByPaymentIdDB({
			paymentId: payment!._id.toString(),
		});
		expect(refund!.status).toBe("REFUND_FAILED");
		expect(refund!.processedAt).toBeFalsy();
		await sendRefundEvent("processed");
		payment = await getPaymentByRefDB({ paystackRef: ref });
		expect(payment!.status).toBe(PaymentStatus.REFUNDED);
		expect(
			(await getBuyerOrderByIdDB({ id: order._id.toString() }))!.status,
		).toBe(OrderStatus.REFUNDED);
	});

	it("escalates a processed webhook whose amount does not match", async () => {
		const { order, ref, amountKobo } = await seedPendingOrder();
		const mongoose = (await import("mongoose")).default;
		const { BuyerOrder } = await import("@/server/models/buyerOrders");
		const { Payment } = await import("@/server/models/payments");
		await BuyerOrder.collection.updateOne(
			{ _id: new mongoose.Types.ObjectId(order._id) },
			{ $set: { status: OrderStatus.PAID } },
		);
		await Payment.collection.updateOne(
			{ paystackRef: ref },
			{ $set: { status: PaymentStatus.SUCCESS, webhookVerified: true } },
		);
		vi.spyOn(paystackProvider, "refund").mockResolvedValue({
			id: 85,
			status: "pending",
			amount: amountKobo,
		});
		await issueRefund({
			orderId: order._id.toString(),
			amountKobo,
			reason: "mismatch test",
		});

		const body = JSON.stringify({
			event: "refund.processed",
			data: {
				id: 85,
				status: "processed",
				amount: amountKobo - 1,
				currency: "NGN",
				domain: "test",
				transaction: { reference: ref },
			},
		});
		await handlePaystackWebhook({ rawBody: body, signature: sign(body) });
		const payment = await getPaymentByRefDB({ paystackRef: ref });
		const refund = await getRefundByPaymentIdDB({
			paymentId: payment!._id.toString(),
		});
		expect(refund!.status).toBe("REFUND_NEEDS_ATTENTION");
		expect(payment!.status).toBe(PaymentStatus.SUCCESS);
		expect(
			(await getBuyerOrderByIdDB({ id: order._id.toString() }))!.status,
		).toBe(OrderStatus.REFUND_FAILED);
	});
});
