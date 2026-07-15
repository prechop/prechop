// `issueRefund` is the single place money leaves Prechop. Its contract is that
// Paystack is called AT MOST ONCE per payment — a second call must never move
// money again — and that a Paystack failure leaves the refund row behind as a
// reconciliation record rather than silently reporting success.
//
// Only the Paystack boundary is mocked. Everything else (payments, refunds,
// orders) is exercised against the real scratch database, so a regression in the
// upsert guard actually fails these tests.

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
import { issueRefund } from "@/server/services/refunds/issueRefund";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeVendor } from "../helpers/factories";

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

const AMOUNT_KOBO = 155000;

/** A paid order with a real payment row behind it — the state a refund needs. */
async function paidOrder(amountKobo: number = AMOUNT_KOBO) {
	const { vendorId, campusId } = await makeVendor();
	const order = await createBuyerOrderDB({
		payload: {
			orderNumber: generateOrderNumber(),
			dailyOrderId: oid(),
			vendorId,
			buyerId: oid(),
			campusId,
			fulfillmentType: FulfillmentType.PICKUP,
			subtotalKobo: amountKobo,
			deliveryFeeKobo: 0,
			platformFeeKobo: 0,
			totalKobo: amountKobo,
			items: [
				{
					dailyOrderItemId: oid(),
					menuItemId: oid(),
					snapshotName: "Jollof",
					snapshotPriceKobo: amountKobo,
					quantity: 1,
					subtotalKobo: amountKobo,
					selectedOptions: [],
				},
			],
		},
	});
	const orderId = order!._id.toString();
	const ref = generatePaystackRef();
	await createPaymentDB({
		payload: {
			buyerOrderId: orderId,
			buyerId: order!.buyerId.toString(),
			vendorId,
			paystackRef: ref,
			amountKobo,
			platformFeeKobo: 0,
			vendorAmountKobo: amountKobo,
			idempotencyKey: hash(ref),
			status: PaymentStatus.SUCCESS,
		},
	});
	return { orderId, ref };
}

describe("issueRefund — the double-payout guard", () => {
	it("refunds once, records the row and stamps the order", async () => {
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({
				id: 987,
				status: "success",
				amount: AMOUNT_KOBO,
			});
		const { orderId, ref } = await paidOrder();

		const result = await issueRefund({
			orderId,
			amountKobo: AMOUNT_KOBO,
			reason: "vendor cancelled",
		});

		expect(result.outcome).toBe("REFUNDED");
		expect(result.paystackRefundId).toBe("987");
		// Money moved against the payment's own reference, for the exact amount.
		expect(refundSpy).toHaveBeenCalledTimes(1);
		expect(refundSpy).toHaveBeenCalledWith(ref, AMOUNT_KOBO);

		// The reconciliation trail is written and marked processed.
		const payment = await getPaymentByOrderIdDB({ buyerOrderId: orderId });
		const refund = await getRefundByPaymentIdDB({
			paymentId: payment!._id.toString(),
		});
		expect(refund!.paystackRefundId).toBe("987");
		expect(refund!.processedAt).toBeTruthy();

		const order = await getBuyerOrderByIdDB({ id: orderId });
		expect(order!.status).toBe(OrderStatus.REFUNDED);
	});

	it("does NOT call Paystack a second time for the same payment", async () => {
		// The regression that matters: a retried cancellation paying the buyer
		// twice. The second call must report ALREADY_REFUNDED and leave Paystack
		// alone.
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({
				id: 111,
				status: "success",
				amount: AMOUNT_KOBO,
			});
		const { orderId } = await paidOrder();

		const first = await issueRefund({
			orderId,
			amountKobo: AMOUNT_KOBO,
			reason: "buyer cancelled",
		});
		expect(first.outcome).toBe("REFUNDED");
		expect(refundSpy).toHaveBeenCalledTimes(1);

		const second = await issueRefund({
			orderId,
			amountKobo: AMOUNT_KOBO,
			reason: "buyer cancelled again",
		});
		expect(second.outcome).toBe("ALREADY_REFUNDED");
		// The whole point: still exactly one payout.
		expect(refundSpy).toHaveBeenCalledTimes(1);
		// Same refund row, reported back to the caller.
		expect(second.refundId).toBe(first.refundId);
	});

	it("cannot be raced into two payouts by concurrent callers", async () => {
		// Two cancels landing at once must still produce exactly one payout: the
		// guard is a unique-index upsert, not a read-then-write check.
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({
				id: 222,
				status: "success",
				amount: AMOUNT_KOBO,
			});
		const { orderId } = await paidOrder();

		const results = await Promise.allSettled([
			issueRefund({ orderId, amountKobo: AMOUNT_KOBO, reason: "a" }),
			issueRefund({ orderId, amountKobo: AMOUNT_KOBO, reason: "b" }),
		]);

		const outcomes = results
			.filter((r) => r.status === "fulfilled")
			.map(
				(r) =>
					(r as PromiseFulfilledResult<{ outcome: string }>).value
						.outcome,
			);
		expect(outcomes).toContain("REFUNDED");
		expect(refundSpy).toHaveBeenCalledTimes(1);
	});

	it("keeps the refund row for reconciliation when Paystack fails", async () => {
		// The failure path of the external call: the row must survive with
		// processedAt unset, and the caller must NOT be told it succeeded.
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockRejectedValue(new Error("paystack down"));
		const { orderId } = await paidOrder();

		await expect(
			issueRefund({
				orderId,
				amountKobo: AMOUNT_KOBO,
				reason: "listing cancelled",
			}),
		).rejects.toThrow(/could not be processed/i);
		expect(refundSpy).toHaveBeenCalledTimes(1);

		const payment = await getPaymentByOrderIdDB({ buyerOrderId: orderId });
		const refund = await getRefundByPaymentIdDB({
			paymentId: payment!._id.toString(),
		});
		expect(refund).not.toBeNull();
		expect(refund!.processedAt).toBeFalsy();
		expect(refund!.paystackRefundId).toBeFalsy();

		// The order is not marked refunded — the money never moved.
		const order = await getBuyerOrderByIdDB({ id: orderId });
		expect(order!.status).not.toBe(OrderStatus.REFUNDED);
	});

	it("a failed payout is retryable only through reconciliation, never re-paid automatically", async () => {
		// After a Paystack failure the row exists, so a naive retry hits the
		// guard and returns ALREADY_REFUNDED rather than paying out. This is the
		// documented trade: an unpaid refund is visible and fixable by hand.
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockRejectedValue(new Error("paystack down"));
		const { orderId } = await paidOrder();
		await expect(
			issueRefund({ orderId, amountKobo: AMOUNT_KOBO, reason: "x" }),
		).rejects.toThrow();

		// Paystack is healthy again and the caller retries — but the refund row
		// from the failed attempt already owns this payment, so no second payout
		// is attempted. Reset the history so this asserts only the retry.
		refundSpy.mockReset();
		refundSpy.mockResolvedValue({
			id: 333,
			status: "success",
			amount: AMOUNT_KOBO,
		});

		const retry = await issueRefund({
			orderId,
			amountKobo: AMOUNT_KOBO,
			reason: "x",
		});
		expect(retry.outcome).toBe("ALREADY_REFUNDED");
		expect(refundSpy).not.toHaveBeenCalled();
	});
});

describe("issueRefund — input guards (Paystack must never be reached)", () => {
	it("rejects a non-positive or fractional amount", async () => {
		const refundSpy = vi.spyOn(paystackProvider, "refund");
		const { orderId } = await paidOrder();

		for (const amountKobo of [0, -1, 10.5]) {
			await expect(
				issueRefund({ orderId, amountKobo, reason: "bad" }),
			).rejects.toThrow(/positive whole number/i);
		}
		expect(refundSpy).not.toHaveBeenCalled();
	});

	it("rejects refunding more than was actually paid", async () => {
		const refundSpy = vi.spyOn(paystackProvider, "refund");
		const { orderId } = await paidOrder(1000);

		await expect(
			issueRefund({ orderId, amountKobo: 1001, reason: "greedy" }),
		).rejects.toThrow(/cannot exceed/i);
		expect(refundSpy).not.toHaveBeenCalled();
	});

	it("rejects an order with no payment", async () => {
		const refundSpy = vi.spyOn(paystackProvider, "refund");
		await expect(
			issueRefund({ orderId: oid(), amountKobo: 100, reason: "none" }),
		).rejects.toThrow();
		expect(refundSpy).not.toHaveBeenCalled();
	});
});
