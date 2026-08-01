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
	createDailyOrderDB,
	getDailyOrderByIdDB,
	setDailyOrderStatusDB,
} from "@/server/models/dailyOrders";
import {
	DailyOrderStatus,
	FulfillmentType,
	OrderStatus,
	PaymentStatus,
} from "@/server/models/enums";
import { createPaymentDB, getPaymentByRefDB } from "@/server/models/payments";
import { getRefundByPaymentIdDB } from "@/server/models/refunds";
import { paystackProvider } from "@/server/providers/paystack";
import { sweepAbandonedOrders } from "@/server/services/buyerOrders/sweepAbandoned";
import { confirmBuyerPaymentByReference } from "@/server/services/payments/confirmBuyerPayment";
import { handlePaystackWebhook } from "@/server/services/payments/handlePaystackWebhook";
import {
	ensureReceiptUrl,
	getPublicReceipt,
} from "@/server/services/payments/receipts";
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
					maxQuantity: null,
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
	return { order: order!, ref, amountKobo };
}

async function seedConfirmableOrder(amountKobo = 155000) {
	const { vendorId, campusId } = await makeVendor();
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
		} as never,
	});
	const savedListing = await getDailyOrderByIdDB({
		id: listing!._id.toString(),
	});
	const itemId = savedListing!.items[0].id ?? savedListing!.items[0]._id!;
	slotKeys.add(`slot:reserved:${itemId}`);
	await setDailyOrderStatusDB({
		id: listing!._id.toString(),
		vendorId,
		status: DailyOrderStatus.ACTIVE,
	});
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
			platformFeeKobo: amountKobo - 150000,
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
			platformFeeKobo: amountKobo - 150000,
			vendorAmountKobo: 140000,
			idempotencyKey: hash(ref),
		},
	});
	slotKeys.add(`slot:reserved:${itemId}:order:${order!._id.toString()}`);
	return {
		order: order!,
		ref,
		amountKobo,
		buyerId,
		dailyOrderId: listing!._id.toString(),
		dailyOrderItemId: itemId.toString(),
	};
}

function verifiedTx({
	ref,
	amountKobo,
	status = "success",
	domain = "test",
	currency = "NGN",
}: {
	ref: string;
	amountKobo: number;
	status?: string;
	domain?: string;
	currency?: string;
}) {
	return {
		status,
		reference: ref,
		amount: amountKobo,
		currency,
		domain,
		channel: "card",
		paid_at: status === "success" ? new Date().toISOString() : null,
		metadata: {},
	};
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
		expect(paid!.status).toBe(OrderStatus.AWAITING_VENDOR_ACCEPTANCE);
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

	it("creates a sanitized public receipt link for a paid order", async () => {
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
		await handlePaystackWebhook({ rawBody: body, signature: sign(body) });
		const paid = await getBuyerOrderByIdDB({ id: order._id.toString() });
		const receiptUrl = await ensureReceiptUrl(paid!);
		const token = new URL(receiptUrl).pathname.split("/").pop();
		const receipt = await getPublicReceipt(token!);

		expect(receipt).toEqual({
			vendorName: "Test Kitchen",
			orderNumber: order.orderNumber,
			amountPaidKobo: amountKobo,
			paymentStatus: "PAID",
			paymentDate: paid!.paidAt!.toISOString(),
			receiptLink: receiptUrl,
		});
		expect(JSON.stringify(receipt)).not.toContain(ref);
		expect(JSON.stringify(receipt)).not.toContain(order.buyerId.toString());
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

describe("confirmBuyerPaymentByReference", () => {
	it("finalises a successful callback before the webhook arrives", async () => {
		const { order, ref, amountKobo, buyerId } =
			await seedConfirmableOrder();
		vi.spyOn(paystackProvider, "verifyTransaction").mockResolvedValue(
			verifiedTx({ ref, amountKobo }),
		);

		const res = await confirmBuyerPaymentByReference({
			buyerId,
			reference: ref,
		});

		expect(res.status).toBe("PAYMENT_CONFIRMED");
		expect(res.order!.orderNumber).toBe(order.orderNumber);
		const paid = await getBuyerOrderByIdDB({ id: order._id.toString() });
		expect(paid!.status).toBe(OrderStatus.AWAITING_VENDOR_ACCEPTANCE);
		const payment = await getPaymentByRefDB({ paystackRef: ref });
		expect(payment!.status).toBe(PaymentStatus.SUCCESS);
		expect(payment!.webhookVerified).toBe(true);
	});

	it("recovers capacity when the order owner hold is missing but atomic stock is available", async () => {
		const {
			order,
			ref,
			amountKobo,
			buyerId,
			dailyOrderId,
			dailyOrderItemId,
		} = await seedConfirmableOrder();
		const mongoose = (await import("mongoose")).default;
		const { DailyOrder } = await import("@/server/models/dailyOrders");
		await DailyOrder.collection.updateOne(
			{
				_id: new mongoose.Types.ObjectId(dailyOrderId),
				"items._id": new mongoose.Types.ObjectId(dailyOrderItemId),
			},
			{
				$set: {
					"items.$.maxQuantity": 1,
					"items.$.orderedQuantity": 0,
				},
			},
		);
		await Redis.set(`slot:reserved:${dailyOrderItemId}`, "1");
		await Redis.del(
			`slot:reserved:${dailyOrderItemId}:order:${order._id.toString()}`,
		);
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({
				id: 77,
				status: "success",
				amount: amountKobo,
			});
		vi.spyOn(paystackProvider, "verifyTransaction").mockResolvedValue(
			verifiedTx({ ref, amountKobo }),
		);

		const res = await confirmBuyerPaymentByReference({
			buyerId,
			reference: ref,
		});

		expect(res.status).toBe("PAYMENT_CONFIRMED");
		const paid = await getBuyerOrderByIdDB({ id: order._id.toString() });
		expect(paid!.status).toBe(OrderStatus.AWAITING_VENDOR_ACCEPTANCE);
		expect(paid!.inventoryCommittedAt).toBeTruthy();
		const listing = await getDailyOrderByIdDB({ id: dailyOrderId });
		expect(
			listing!.items.find((item) => item.id === dailyOrderItemId)!
				.orderedQuantity,
		).toBe(1);
		const payment = await getPaymentByRefDB({ paystackRef: ref });
		expect(payment!.status).toBe(PaymentStatus.SUCCESS);
		const refund = await getRefundByPaymentIdDB({
			paymentId: payment!._id.toString(),
		});
		expect(refund).toBeNull();
		expect(refundSpy).not.toHaveBeenCalled();
	});

	it("is idempotent when the webhook already finalised the order", async () => {
		const { order, ref, amountKobo, buyerId } =
			await seedConfirmableOrder();
		const body = JSON.stringify({
			event: "charge.success",
			data: {
				reference: ref,
				amount: amountKobo,
				channel: "card",
				status: "success",
			},
		});
		await handlePaystackWebhook({ rawBody: body, signature: sign(body) });
		vi.spyOn(paystackProvider, "verifyTransaction").mockResolvedValue(
			verifiedTx({ ref, amountKobo }),
		);

		const res = await confirmBuyerPaymentByReference({
			buyerId,
			reference: ref,
		});

		expect(res.status).toBe("PAYMENT_CONFIRMED");
		expect(res.order!.orderNumber).toBe(order.orderNumber);
	});

	it("does not refund or double-commit on duplicate callback and webhook", async () => {
		const {
			order,
			ref,
			amountKobo,
			buyerId,
			dailyOrderId,
			dailyOrderItemId,
		} = await seedConfirmableOrder();
		const mongoose = (await import("mongoose")).default;
		const { DailyOrder } = await import("@/server/models/dailyOrders");
		await DailyOrder.collection.updateOne(
			{
				_id: new mongoose.Types.ObjectId(dailyOrderId),
				"items._id": new mongoose.Types.ObjectId(dailyOrderItemId),
			},
			{
				$set: {
					"items.$.maxQuantity": 1,
					"items.$.orderedQuantity": 0,
				},
			},
		);
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({
				id: 78,
				status: "success",
				amount: amountKobo,
			});
		vi.spyOn(paystackProvider, "verifyTransaction").mockResolvedValue(
			verifiedTx({ ref, amountKobo }),
		);
		const body = JSON.stringify({
			event: "charge.success",
			data: {
				reference: ref,
				amount: amountKobo,
				channel: "card",
				status: "success",
			},
		});

		await confirmBuyerPaymentByReference({ buyerId, reference: ref });
		await handlePaystackWebhook({ rawBody: body, signature: sign(body) });
		await confirmBuyerPaymentByReference({ buyerId, reference: ref });

		const listing = await getDailyOrderByIdDB({ id: dailyOrderId });
		expect(
			listing!.items.find((item) => item.id === dailyOrderItemId)!
				.orderedQuantity,
		).toBe(1);
		const paid = await getBuyerOrderByIdDB({ id: order._id.toString() });
		expect(paid!.status).toBe(OrderStatus.AWAITING_VENDOR_ACCEPTANCE);
		const payment = await getPaymentByRefDB({ paystackRef: ref });
		const refund = await getRefundByPaymentIdDB({
			paymentId: payment!._id.toString(),
		});
		expect(refund).toBeNull();
		expect(refundSpy).not.toHaveBeenCalled();
	});

	it("refunds only when atomic capacity is genuinely exhausted", async () => {
		const {
			order,
			ref,
			amountKobo,
			buyerId,
			dailyOrderId,
			dailyOrderItemId,
		} = await seedConfirmableOrder();
		const mongoose = (await import("mongoose")).default;
		const { DailyOrder } = await import("@/server/models/dailyOrders");
		await DailyOrder.collection.updateOne(
			{
				_id: new mongoose.Types.ObjectId(dailyOrderId),
				"items._id": new mongoose.Types.ObjectId(dailyOrderItemId),
			},
			{
				$set: {
					"items.$.maxQuantity": 1,
					"items.$.orderedQuantity": 1,
				},
			},
		);
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({
				id: 79,
				status: "success",
				amount: amountKobo,
			});
		vi.spyOn(paystackProvider, "verifyTransaction").mockResolvedValue(
			verifiedTx({ ref, amountKobo }),
		);

		const res = await confirmBuyerPaymentByReference({
			buyerId,
			reference: ref,
		});

		expect(res.status).toBe("ORDER_STATE_CONFLICT");
		expect(refundSpy).toHaveBeenCalledTimes(1);
		const refunded = await getBuyerOrderByIdDB({
			id: order._id.toString(),
		});
		expect(refunded!.status).toBe(OrderStatus.REFUNDED);
	});

	it("returns pending for a non-terminal Paystack transaction", async () => {
		const { ref, amountKobo, buyerId } = await seedConfirmableOrder();
		vi.spyOn(paystackProvider, "verifyTransaction").mockResolvedValue(
			verifiedTx({ ref, amountKobo, status: "ongoing" }),
		);

		const res = await confirmBuyerPaymentByReference({
			buyerId,
			reference: ref,
		});

		expect(res.status).toBe("PAYMENT_PENDING");
		expect(res.retryable).toBe(true);
	});

	it("returns failed for a terminal unsuccessful Paystack transaction", async () => {
		const { ref, amountKobo, buyerId } = await seedConfirmableOrder();
		vi.spyOn(paystackProvider, "verifyTransaction").mockResolvedValue(
			verifiedTx({ ref, amountKobo, status: "failed" }),
		);

		const res = await confirmBuyerPaymentByReference({
			buyerId,
			reference: ref,
		});

		expect(res.status).toBe("PAYMENT_FAILED");
	});

	it("returns amount mismatch without finalising", async () => {
		const { order, ref, buyerId } = await seedConfirmableOrder(155000);
		vi.spyOn(paystackProvider, "verifyTransaction").mockResolvedValue(
			verifiedTx({ ref, amountKobo: 154000 }),
		);

		const res = await confirmBuyerPaymentByReference({
			buyerId,
			reference: ref,
		});

		expect(res.status).toBe("AMOUNT_MISMATCH");
		const unchanged = await getBuyerOrderByIdDB({
			id: order._id.toString(),
		});
		expect(unchanged!.status).toBe(OrderStatus.PENDING_PAYMENT);
	});

	it("returns reference not found for the wrong buyer", async () => {
		const { ref } = await seedConfirmableOrder();

		const res = await confirmBuyerPaymentByReference({
			buyerId: oid(),
			reference: ref,
		});

		expect(res.status).toBe("REFERENCE_NOT_FOUND");
	});

	it("returns mode mismatch without finalising", async () => {
		const { order, ref, amountKobo, buyerId } =
			await seedConfirmableOrder();
		vi.spyOn(paystackProvider, "verifyTransaction").mockResolvedValue(
			verifiedTx({ ref, amountKobo, domain: "live" }),
		);

		const res = await confirmBuyerPaymentByReference({
			buyerId,
			reference: ref,
		});

		expect(res.status).toBe("MODE_MISMATCH");
		const unchanged = await getBuyerOrderByIdDB({
			id: order._id.toString(),
		});
		expect(unchanged!.status).toBe(OrderStatus.PENDING_PAYMENT);
	});

	it("routes a successful payment on a cancelled order to conflict", async () => {
		const { order, ref, amountKobo, buyerId } =
			await seedConfirmableOrder();
		const mongoose = (await import("mongoose")).default;
		const { BuyerOrder } = await import("@/server/models/buyerOrders");
		await BuyerOrder.collection.updateOne(
			{ _id: new mongoose.Types.ObjectId(order._id) },
			{ $set: { status: OrderStatus.CANCELLED } },
		);
		vi.spyOn(paystackProvider, "refund").mockResolvedValue({
			id: 99,
			status: "success",
			amount: amountKobo,
		});
		vi.spyOn(paystackProvider, "verifyTransaction").mockResolvedValue(
			verifiedTx({ ref, amountKobo }),
		);

		const res = await confirmBuyerPaymentByReference({
			buyerId,
			reference: ref,
		});

		expect(res.status).toBe("ORDER_STATE_CONFLICT");
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
						selectedOptions: [],
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
