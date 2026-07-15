// PRD §8.14 admin refund — the only path a human can move money out of Prechop.
//
// REGRESSION (partial refund): v1 supports FULL refunds only. A bug flipped the
// order to REFUNDED on a partial amount and then `createRefundDB`'s unique
// paymentId index turned the remainder into an ALREADY_REFUNDED no-op — paying
// out part of the money and stranding the rest forever. The service must REJECT
// any `amountKobo` that isn't the full order total, leaving order + payment
// untouched. These tests pin that.
//
// Only Paystack's refund boundary is mocked; the order, payment and refund rows
// are real, so a regression that lets a partial through actually fails here.

import mongoose from "mongoose";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import hash from "@/server/constants/hash";
import {
	generateOrderNumber,
	generatePaystackRef,
} from "@/server/constants/orderNumber";
import {
	createBuyerOrderDB,
	createPaymentDB,
	FulfillmentType,
	getBuyerOrderByIdDB,
	getPaymentByOrderIdDB,
	getRefundByPaymentIdDB,
	OrderStatus,
	PaymentStatus,
} from "@/server/models";
import { paystackProvider } from "@/server/providers";
import { refundOrderAsAdmin } from "@/server/services/admin/refunds";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeVendor } from "../helpers/factories";

const TOTAL = 300000;
const actor = {
	userId: oid(),
	role: "Admin",
	ip: "1.2.3.4",
	userAgent: "vitest",
};

beforeAll(async () => {
	await connectTestDB();
});

afterEach(() => {
	vi.restoreAllMocks();
});

afterAll(async () => {
	vi.restoreAllMocks();
	await dropAndDisconnect();
});

async function paidOrder(status: OrderStatus = OrderStatus.PAID) {
	const { vendorId, campusId } = await makeVendor();
	const order = await createBuyerOrderDB({
		payload: {
			orderNumber: generateOrderNumber(),
			dailyOrderId: oid(),
			vendorId,
			buyerId: oid(),
			campusId,
			status,
			fulfillmentType: FulfillmentType.PICKUP,
			subtotalKobo: TOTAL,
			deliveryFeeKobo: 0,
			platformFeeKobo: 0,
			totalKobo: TOTAL,
			items: [
				{
					dailyOrderItemId: oid(),
					menuItemId: oid(),
					snapshotName: "Jollof",
					snapshotPriceKobo: TOTAL,
					quantity: 1,
					subtotalKobo: TOTAL,
					selectedOptions: [],
				},
			],
		} as never,
	});
	const orderId = order!._id.toString();
	const ref = generatePaystackRef();
	await createPaymentDB({
		payload: {
			buyerOrderId: orderId,
			buyerId: order!.buyerId.toString(),
			vendorId,
			paystackRef: ref,
			amountKobo: TOTAL,
			platformFeeKobo: 0,
			vendorAmountKobo: TOTAL,
			idempotencyKey: hash(ref),
			status: PaymentStatus.SUCCESS,
		} as never,
	});
	return { orderId, ref };
}

describe("refundOrderAsAdmin — full-refund-only invariant", () => {
	it("REJECTS a sub-total partial refund and leaves the order + payment untouched", async () => {
		const refundSpy = vi.spyOn(paystackProvider, "refund");
		const { orderId } = await paidOrder();

		await expect(
			refundOrderAsAdmin({
				orderId,
				amountKobo: TOTAL - 50000, // less than the full total
				reason: "buyer complained about one item",
				actor,
			}),
		).rejects.toThrow(/partial refunds are not supported/i);

		// Paystack was never reached — no money moved.
		expect(refundSpy).not.toHaveBeenCalled();
		// The order is still PAID, and NO refund row was written.
		const order = await getBuyerOrderByIdDB({ id: orderId });
		expect(order!.status).toBe(OrderStatus.PAID);
		const payment = await getPaymentByOrderIdDB({ buyerOrderId: orderId });
		expect(payment!.status).toBe(PaymentStatus.SUCCESS);
		const refund = await getRefundByPaymentIdDB({
			paymentId: payment!._id.toString(),
		});
		expect(refund).toBeNull();
	});

	it("also rejects a refund GREATER than the total", async () => {
		const refundSpy = vi.spyOn(paystackProvider, "refund");
		const { orderId } = await paidOrder();
		await expect(
			refundOrderAsAdmin({
				orderId,
				amountKobo: TOTAL + 1,
				reason: "typo",
				actor,
			}),
		).rejects.toThrow(/partial refunds are not supported/i);
		expect(refundSpy).not.toHaveBeenCalled();
	});

	it("ACCEPTS the full total and refunds", async () => {
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({ id: 42, status: "success", amount: TOTAL });
		const { orderId, ref } = await paidOrder();

		const res = await refundOrderAsAdmin({
			orderId,
			amountKobo: TOTAL,
			reason: "vendor never delivered",
			actor,
		});
		expect(res.outcome).toBe("REFUNDED");
		expect(res.amountKobo).toBe(TOTAL);
		expect(refundSpy).toHaveBeenCalledWith(ref, TOTAL);

		const order = await getBuyerOrderByIdDB({ id: orderId });
		expect(order!.status).toBe(OrderStatus.REFUNDED);
	});

	it("ACCEPTS an omitted amount as a full-total refund", async () => {
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({ id: 43, status: "success", amount: TOTAL });
		const { orderId } = await paidOrder();

		const res = await refundOrderAsAdmin({
			orderId,
			reason: "full refund, no amount given",
			actor,
		});
		expect(res.outcome).toBe("REFUNDED");
		// The full captured amount moves even though no amount was supplied.
		expect(refundSpy).toHaveBeenCalledWith(expect.any(String), TOTAL);
	});

	it("rejects a refund on a status with no captured payment", async () => {
		const refundSpy = vi.spyOn(paystackProvider, "refund");
		const { orderId } = await paidOrder(OrderStatus.PENDING_PAYMENT);
		await expect(
			refundOrderAsAdmin({
				orderId,
				amountKobo: TOTAL,
				reason: "x",
				actor,
			}),
		).rejects.toThrow(/no captured payment/i);
		expect(refundSpy).not.toHaveBeenCalled();
	});

	it("rejects a refund on an already-REFUNDED order", async () => {
		const { orderId } = await paidOrder();
		// Flip it to REFUNDED directly.
		await mongoose.connection
			.db!.collection("buyerorders")
			.updateOne(
				{ _id: new mongoose.Types.ObjectId(orderId) },
				{ $set: { status: OrderStatus.REFUNDED } },
			);
		await expect(
			refundOrderAsAdmin({
				orderId,
				amountKobo: TOTAL,
				reason: "x",
				actor,
			}),
		).rejects.toThrow(/already been refunded/i);
	});

	it("throws for an unknown order", async () => {
		await expect(
			refundOrderAsAdmin({ orderId: oid(), reason: "x", actor }),
		).rejects.toThrow();
	});
});
