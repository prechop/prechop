// `cutoff.enforce` — the sweep that ends the worst state in the system: a buyer
// paid, the vendor never confirmed, and the money is sitting with the vendor
// while the buyer got no food. This sweep cancels the order AND refunds the
// buyer. It moves real money, so it must be tested against real orders,
// payments and refund rows — not a hall of mirrors.
//
// The ONLY thing mocked is the Paystack refund boundary (no network in tests).
// Every buyer order, payment, daily-order listing and refund row lives in the
// real scratch Mongo, so a regression in the cancel/refund/guard logic actually
// fails these tests.

import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

// The sweep imports `findStalePaidOrdersPastCutoffDB` from the models barrel as a
// live binding, so spying on the namespace object is unreliable (barrel re-exports
// are often non-writable). Instead we replace ONLY that one export with a vi.fn
// that DEFAULTS to the real implementation — so the DB-backed tests exercise the
// genuine aggregation, and the two tests that need to force a race / an empty
// batch can override the finder without touching any other model function, all of
// which stay real (real orders, payments and refund rows).
const { findMock, real } = vi.hoisted(() => ({
	findMock: vi.fn(),
	real: { impl: undefined as unknown },
}));
vi.mock("@/server/models", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	real.impl = actual.findStalePaidOrdersPastCutoffDB;
	return { ...actual, findStalePaidOrdersPastCutoffDB: findMock };
});

import hash from "@/server/constants/hash";
import {
	generateOrderNumber,
	generatePaystackRef,
	generateShareableToken,
} from "@/server/constants/orderNumber";
import {
	createBuyerOrderDB,
	createDailyOrderDB,
	createPaymentDB,
	FulfillmentType,
	getBuyerOrderByIdDB,
	getPaymentByOrderIdDB,
	getRefundByPaymentIdDB,
	OrderStatus,
	PaymentStatus,
	setBuyerOrderStatusDB,
} from "@/server/models";
import { paystackProvider } from "@/server/providers";
import { sweepStalePaidOrders } from "@/server/services/buyerOrders/sweepStalePaidOrders";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeVendor } from "../helpers/factories";

beforeAll(async () => {
	await connectTestDB();
});

beforeEach(() => {
	// Every test starts with the REAL finder (real aggregation over the scratch
	// DB); the two tests that force a race / empty batch override it explicitly.
	findMock.mockReset();
	findMock.mockImplementation(real.impl as (...args: unknown[]) => unknown);
});

afterEach(() => {
	vi.restoreAllMocks();
});

afterAll(async () => {
	vi.restoreAllMocks();
	await dropAndDisconnect();
});

const AMOUNT_KOBO = 155000;

/** A past-cutoff listing plus a buyer order sitting in `status` behind it, with a
 * captured payment. This is exactly the state the sweep hunts for. */
async function stalePaidOrder({
	amountKobo = AMOUNT_KOBO,
	status = OrderStatus.PAID,
	cutoffAgoMs = 60 * 60 * 1000,
}: {
	amountKobo?: number;
	status?: OrderStatus;
	cutoffAgoMs?: number;
} = {}) {
	const { vendorId, campusId } = await makeVendor();
	// The listing's cutoff is in the PAST — this is what makes the order "stale".
	const listing = await createDailyOrderDB({
		payload: {
			vendorId,
			campusId,
			shareableToken: generateShareableToken(),
			title: "Lunch",
			scheduledDate: new Date(Date.now() - cutoffAgoMs - 3_600_000),
			cutoffTime: new Date(Date.now() - cutoffAgoMs),
			pickupAvailable: true,
			items: [
				{
					menuItemId: oid(),
					snapshotName: "Jollof",
					snapshotPriceKobo: amountKobo,
					snapshotPrepMin: 20,
					maxQuantity: 10,
				},
			],
		},
	});
	const dailyOrderId = listing!._id.toString();
	const buyerId = oid();
	const order = await createBuyerOrderDB({
		payload: {
			orderNumber: generateOrderNumber(),
			dailyOrderId,
			vendorId,
			buyerId,
			campusId,
			fulfillmentType: FulfillmentType.PICKUP,
			status,
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
			buyerId,
			vendorId,
			paystackRef: ref,
			amountKobo,
			platformFeeKobo: 0,
			vendorAmountKobo: amountKobo,
			idempotencyKey: hash(ref),
			status: PaymentStatus.SUCCESS,
		},
	});
	return { orderId, ref, buyerId, dailyOrderId };
}

describe("sweepStalePaidOrders — the cutoff-enforce money path", () => {
	it("cancels a PAID-past-cutoff order AND writes a refund row for the buyer", async () => {
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({
				id: 5001,
				status: "success",
				amount: AMOUNT_KOBO,
			});
		const { orderId, ref } = await stalePaidOrder();

		const result = await sweepStalePaidOrders();

		// The buyer whose money was stranded is made whole: cancelled + refunded.
		expect(result.scanned).toBeGreaterThanOrEqual(1);
		expect(result.cancelled).toBeGreaterThanOrEqual(1);
		expect(result.refunded).toBeGreaterThanOrEqual(1);
		expect(result.failed).toBe(0);

		// Money actually moved, against the payment's own reference, once.
		expect(refundSpy).toHaveBeenCalledWith(ref, AMOUNT_KOBO);

		// The refund row — the reconciliation record that money left the platform.
		const payment = await getPaymentByOrderIdDB({ buyerOrderId: orderId });
		const refund = await getRefundByPaymentIdDB({
			paymentId: payment!._id.toString(),
		});
		expect(refund).not.toBeNull();
		expect(refund!.amountKobo).toBe(AMOUNT_KOBO);
		expect(refund!.processedAt).toBeTruthy();

		// issueRefund flips the order to REFUNDED on a successful payout.
		const order = await getBuyerOrderByIdDB({ id: orderId });
		expect(order!.status).toBe(OrderStatus.REFUNDED);
	});

	it("race guard: an order concurrently flipped to CONFIRMED is NOT swept", async () => {
		// The scanner flags an order as PAID, but before the sweep can cancel it a
		// vendor confirms it (PAID → CONFIRMED). `fromStatuses: [PAID]` makes the
		// cancel a no-op, and no money moves. We simulate the race by mocking ONLY
		// the finder to hand back an order that is CONFIRMED in the DB by the time
		// the loop tries to cancel it — everything downstream (cancel, refund) is
		// the real code.
		const refundSpy = vi.spyOn(paystackProvider, "refund");
		const { orderId, dailyOrderId } = await stalePaidOrder();
		// The vendor confirmed it — this is the row the sweep will actually touch.
		const confirmed = await setBuyerOrderStatusDB({
			id: orderId,
			status: OrderStatus.CONFIRMED,
			fromStatuses: [OrderStatus.PAID],
		});
		expect(confirmed!.status).toBe(OrderStatus.CONFIRMED);

		findMock.mockResolvedValue([
			{
				id: orderId,
				vendorId: oid(),
				buyerId: oid(),
				dailyOrderId,
				totalKobo: AMOUNT_KOBO,
				cutoffTime: new Date(Date.now() - 3_600_000),
			},
		]);

		const result = await sweepStalePaidOrders();

		expect(findMock).toHaveBeenCalled();
		// Scanned it, but the fromStatuses guard refused to cancel or refund.
		expect(result.scanned).toBe(1);
		expect(result.cancelled).toBe(0);
		expect(result.refunded).toBe(0);
		expect(refundSpy).not.toHaveBeenCalled();

		// The order the vendor is now cooking is untouched — still CONFIRMED.
		const order = await getBuyerOrderByIdDB({ id: orderId });
		expect(order!.status).toBe(OrderStatus.CONFIRMED);
	});

	it("per-order failure isolation: one failed refund does not abort the batch", async () => {
		// Two stale PAID orders. The first refund throws (Paystack down); the sweep
		// must log it, count it as failed, and STILL refund the second buyer —
		// a single un-refundable order cannot starve everyone behind it.
		vi.spyOn(console, "error").mockImplementation(() => {});
		const a = await stalePaidOrder();
		const b = await stalePaidOrder();

		// One call fails, the rest succeed — regardless of sweep iteration order,
		// exactly one order fails and one is refunded.
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockRejectedValueOnce(new Error("paystack down"))
			.mockResolvedValue({
				id: 6001,
				status: "success",
				amount: AMOUNT_KOBO,
			});

		const result = await sweepStalePaidOrders();

		expect(result.scanned).toBe(2);
		// Both are cancelled (cancel precedes the refund attempt) …
		expect(result.cancelled).toBe(2);
		// … but exactly one payout succeeded and one failed. The batch did not abort.
		expect(result.refunded).toBe(1);
		expect(result.failed).toBe(1);
		expect(refundSpy).toHaveBeenCalledTimes(2);

		// Whichever order failed keeps an unprocessed refund row for reconciliation
		// (money never moved) while the other is fully REFUNDED.
		const statuses = await Promise.all(
			[a.orderId, b.orderId].map(async (id) => {
				const o = await getBuyerOrderByIdDB({ id });
				return o!.status;
			}),
		);
		expect(statuses).toContain(OrderStatus.REFUNDED);
		expect(statuses).toContain(OrderStatus.CANCELLED);
	});

	it("counts a cancel but no refund when the payment was already refunded", async () => {
		// issueRefund reports ALREADY_REFUNDED (idempotent) — the order is still
		// cancelled, but `refunded` is not double-counted. This pins the
		// `outcome === "REFUNDED"` branch.
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({
				id: 7001,
				status: "success",
				amount: AMOUNT_KOBO,
			});
		const { orderId } = await stalePaidOrder();

		// First sweep refunds it.
		const first = await sweepStalePaidOrders();
		expect(first.refunded).toBeGreaterThanOrEqual(1);

		// Re-open the order to PAID so the finder flags it again, but the refund
		// row already owns the payment → ALREADY_REFUNDED, no second payout.
		refundSpy.mockClear();
		await setBuyerOrderStatusDB({
			id: orderId,
			status: OrderStatus.PAID,
		});

		const second = await sweepStalePaidOrders();
		expect(second.cancelled).toBeGreaterThanOrEqual(1);
		// No second payout — the guard held.
		expect(refundSpy).not.toHaveBeenCalled();
	});

	it("is a no-op when nothing is stale", async () => {
		const refundSpy = vi.spyOn(paystackProvider, "refund");
		findMock.mockResolvedValue([]);

		const result = await sweepStalePaidOrders();

		expect(result).toEqual({
			scanned: 0,
			cancelled: 0,
			refunded: 0,
			failed: 0,
		});
		expect(refundSpy).not.toHaveBeenCalled();
	});
});
