// Three more money-adjacent service paths that were low/zero coverage:
//   - getVendorEarnings: what a vendor is told they earned (Payment SUCCESS rows).
//   - refundOrdersForDailyOrder / expireExternalPaymentOrdersForDailyOrder: the
//     bulk refund/expire when a vendor cancels a whole listing.
//   - cancelOrderAsBuyer / cancelOrderAsVendor: single-order cancel + refund.
//
// Real Mongo. Only the Paystack refund boundary and the Sendchamp SMS boundary
// are mocked — the refund-row and status mechanics run for real.

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
	OrderStatus,
	PaymentStatus,
} from "@/server/models";
import { paystackProvider, sendchampProvider } from "@/server/providers";
import { getVendorEarnings } from "@/server/services/analytics/getVendorEarnings";
import {
	cancelOrderAsBuyer,
	cancelOrderAsVendor,
} from "@/server/services/buyerOrders/cancel";
import {
	expireExternalPaymentOrdersForDailyOrder,
	refundOrdersForDailyOrder,
} from "@/server/services/buyerOrders/refundForDailyOrder";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeVendor } from "../helpers/factories";

const TOTAL = 200000;
const DAY = 24 * 60 * 60 * 1000;

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

async function order({
	vendorId,
	campusId,
	buyerId = oid(),
	dailyOrderId = oid(),
	status = OrderStatus.PAID,
	withPayment = true,
}: {
	vendorId: string;
	campusId: string;
	buyerId?: string;
	dailyOrderId?: string;
	status?: OrderStatus;
	withPayment?: boolean;
}) {
	const doc = await createBuyerOrderDB({
		payload: {
			orderNumber: generateOrderNumber(),
			dailyOrderId,
			vendorId,
			buyerId,
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
	const orderId = doc!._id.toString();
	let ref: string | undefined;
	if (withPayment) {
		ref = generatePaystackRef();
		await createPaymentDB({
			payload: {
				buyerOrderId: orderId,
				buyerId,
				vendorId,
				paystackRef: ref,
				amountKobo: TOTAL,
				platformFeeKobo: 0,
				vendorAmountKobo: TOTAL,
				idempotencyKey: hash(ref),
				status:
					status === OrderStatus.AWAITING_EXTERNAL_PAYMENT
						? PaymentStatus.AWAITING_EXTERNAL_PAYMENT
						: PaymentStatus.SUCCESS,
			} as never,
		});
	}
	return { orderId, buyerId, dailyOrderId, ref };
}

describe("getVendorEarnings", () => {
	async function successPayment(
		vendorId: string,
		paidAt: Date,
		split: {
			foodSubtotalKobo: number;
			deliveryFeeKobo: number;
			prechopCommissionKobo: number;
			vendorSettlementKobo: number;
		},
	) {
		const ref = generatePaystackRef();
		await createPaymentDB({
			payload: {
				buyerOrderId: oid(),
				buyerId: oid(),
				vendorId,
				paystackRef: ref,
				amountKobo: TOTAL,
				platformFeeKobo: split.prechopCommissionKobo,
				vendorAmountKobo: split.vendorSettlementKobo,
				idempotencyKey: hash(ref),
				status: PaymentStatus.SUCCESS,
				paidAt,
				...split,
			} as never,
		});
	}

	it("sums the vendor's gross, commission and net settlement from SUCCESS payments", async () => {
		const { userId, vendorId } = await makeVendor({ withSubaccount: true });
		await successPayment(vendorId, new Date(), {
			foodSubtotalKobo: 100000,
			deliveryFeeKobo: 5000,
			prechopCommissionKobo: 8000,
			vendorSettlementKobo: 97000,
		});

		const earnings = await getVendorEarnings({ userId, range: "all" });
		expect(earnings.bankConnected).toBe(true);
		expect(earnings.platformFeeVendorPercent).toBe(8); // env default policy
		// gross = food + delivery, NOT amountKobo (which includes the buyer fee).
		expect(earnings.totals.grossKobo).toBe(105000);
		expect(earnings.totals.platformFeeKobo).toBe(8000);
		expect(earnings.totals.netSettledKobo).toBe(97000);
		expect(earnings.totals.orders).toBe(1);
		expect(earnings.days.length).toBeGreaterThanOrEqual(1);
	});

	it("respects the range window: 'today' excludes an older payment that 'all' includes", async () => {
		const { userId, vendorId } = await makeVendor();
		// One paid 10 days ago, one paid now.
		await successPayment(vendorId, new Date(Date.now() - 10 * DAY), {
			foodSubtotalKobo: 50000,
			deliveryFeeKobo: 0,
			prechopCommissionKobo: 4000,
			vendorSettlementKobo: 46000,
		});
		await successPayment(vendorId, new Date(), {
			foodSubtotalKobo: 60000,
			deliveryFeeKobo: 0,
			prechopCommissionKobo: 4800,
			vendorSettlementKobo: 55200,
		});

		const today = await getVendorEarnings({ userId, range: "today" });
		expect(today.totals.orders).toBe(1);
		expect(today.totals.grossKobo).toBe(60000);

		const all = await getVendorEarnings({ userId, range: "all" });
		expect(all.totals.orders).toBe(2);
		expect(all.totals.grossKobo).toBe(110000);

		// 'week' (last 7 Lagos days) excludes the 10-day-old one.
		const week = await getVendorEarnings({ userId, range: "week" });
		expect(week.totals.orders).toBe(1);
	});

	it("reports bankConnected=false and zero totals for a vendor with no payments", async () => {
		const { userId } = await makeVendor({ withSubaccount: false });
		const earnings = await getVendorEarnings({ userId, range: "month" });
		expect(earnings.bankConnected).toBe(false);
		expect(earnings.totals).toEqual({
			grossKobo: 0,
			platformFeeKobo: 0,
			netSettledKobo: 0,
			orders: 0,
		});
		expect(earnings.days).toEqual([]);
	});
});

describe("refundOrdersForDailyOrder", () => {
	it("refunds every PAID/CONFIRMED order on the listing and skips the rest", async () => {
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({ id: 1, status: "success", amount: TOTAL });
		const { vendorId, campusId } = await makeVendor();
		const dailyOrderId = oid();
		const paid = await order({
			vendorId,
			campusId,
			dailyOrderId,
			status: OrderStatus.PAID,
		});
		const confirmed = await order({
			vendorId,
			campusId,
			dailyOrderId,
			status: OrderStatus.CONFIRMED,
		});
		// A pending one that must be skipped (no captured money).
		await order({
			vendorId,
			campusId,
			dailyOrderId,
			status: OrderStatus.PENDING_PAYMENT,
			withPayment: false,
		});

		const res = await refundOrdersForDailyOrder({ vendorId, dailyOrderId });
		expect(res.refunded).toBe(2);
		expect(res.failed).toBe(0);
		expect(refundSpy).toHaveBeenCalledTimes(2);

		for (const o of [paid, confirmed]) {
			const fresh = await getBuyerOrderByIdDB({ id: o.orderId });
			expect(fresh!.status).toBe(OrderStatus.REFUNDED);
		}
	});

	it("isolates a per-order refund failure without aborting the batch", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { vendorId, campusId } = await makeVendor();
		const dailyOrderId = oid();
		await order({
			vendorId,
			campusId,
			dailyOrderId,
			status: OrderStatus.PAID,
		});
		await order({
			vendorId,
			campusId,
			dailyOrderId,
			status: OrderStatus.PAID,
		});
		vi.spyOn(paystackProvider, "refund")
			.mockRejectedValueOnce(new Error("paystack down"))
			.mockResolvedValue({ id: 2, status: "success", amount: TOTAL });

		const res = await refundOrdersForDailyOrder({ vendorId, dailyOrderId });
		expect(res.refunded).toBe(1);
		expect(res.failed).toBe(1);
	});
});

describe("expireExternalPaymentOrdersForDailyOrder", () => {
	// BUG GUARD (product defect, see HANDOFF): this function loops over
	// `listBuyerOrdersByVendorAndDailyOrderDB`, whose `$match` only returns
	// PAID / CONFIRMED / PREPARING / READY / COMPLETED — it deliberately EXCLUDES
	// AWAITING_EXTERNAL_PAYMENT. But the function only ever acts on
	// AWAITING_EXTERNAL_PAYMENT orders, so the two sets never intersect and it can
	// NEVER expire anything: it always returns 0 and leaves the "Pay for Me" order
	// live past its listing close. This test pins that broken reality so it can't
	// be mistaken for working; when the query is fixed to include the status, this
	// test SHOULD start failing (expired becomes 1) — that failure is the signal.
	it("BUG: expires nothing because the underlying query excludes the status it targets", async () => {
		const { vendorId, campusId } = await makeVendor();
		const dailyOrderId = oid();
		const ext = await order({
			vendorId,
			campusId,
			dailyOrderId,
			status: OrderStatus.AWAITING_EXTERNAL_PAYMENT,
		});
		await order({
			vendorId,
			campusId,
			dailyOrderId,
			status: OrderStatus.PAID,
		});

		const expired = await expireExternalPaymentOrdersForDailyOrder({
			vendorId,
			dailyOrderId,
		});
		// Currently ZERO — the AWAITING order was never even returned to the loop.
		expect(expired).toBe(0);
		const fresh = await getBuyerOrderByIdDB({ id: ext.orderId });
		// The order the function was supposed to expire is untouched.
		expect(fresh!.status).toBe(OrderStatus.AWAITING_EXTERNAL_PAYMENT);
	});
});

describe("cancelOrderAsBuyer", () => {
	it("cancels a PAID order and refunds the buyer", async () => {
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({ id: 3, status: "success", amount: TOTAL });
		const { vendorId, campusId } = await makeVendor();
		const buyerId = oid();
		const o = await order({
			vendorId,
			campusId,
			buyerId,
			status: OrderStatus.PAID,
		});

		const res = await cancelOrderAsBuyer({
			buyerId,
			orderId: o.orderId,
			reason: "changed plans",
		});
		expect(res.message).toMatch(/cancelled/i);
		expect(refundSpy).toHaveBeenCalledWith(o.ref, TOTAL);
		const fresh = await getBuyerOrderByIdDB({ id: o.orderId });
		expect(fresh!.status).toBe(OrderStatus.REFUNDED);
	});

	it("cancels an AWAITING_EXTERNAL_PAYMENT order without a refund (no money captured)", async () => {
		const refundSpy = vi.spyOn(paystackProvider, "refund");
		const { vendorId, campusId } = await makeVendor();
		const buyerId = oid();
		const o = await order({
			vendorId,
			campusId,
			buyerId,
			status: OrderStatus.AWAITING_EXTERNAL_PAYMENT,
		});

		await cancelOrderAsBuyer({
			buyerId,
			orderId: o.orderId,
			reason: "abandon",
		});
		expect(refundSpy).not.toHaveBeenCalled();
		const payment = await getPaymentByOrderIdDB({
			buyerOrderId: o.orderId,
		});
		expect(payment!.status).toBe(PaymentStatus.CANCELLED);
	});

	it("rejects a cancel from a non-owner, and a non-cancellable status", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyerId = oid();
		const owned = await order({
			vendorId,
			campusId,
			buyerId,
			status: OrderStatus.PAID,
		});
		await expect(
			cancelOrderAsBuyer({
				buyerId: oid(),
				orderId: owned.orderId,
				reason: "x",
			}),
		).rejects.toThrow();

		const completed = await order({
			vendorId,
			campusId,
			buyerId,
			status: OrderStatus.COMPLETED,
		});
		await expect(
			cancelOrderAsBuyer({
				buyerId,
				orderId: completed.orderId,
				reason: "x",
			}),
		).rejects.toThrow();
	});

	it("throws for an unknown order", async () => {
		await expect(
			cancelOrderAsBuyer({ buyerId: oid(), orderId: oid(), reason: "x" }),
		).rejects.toThrow();
	});
});

describe("cancelOrderAsVendor", () => {
	it("cancels a PAID order, refunds, and SMS-notifies the buyer", async () => {
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({ id: 4, status: "success", amount: TOTAL });
		const smsSpy = vi
			.spyOn(sendchampProvider, "sendOrderCancelled")
			.mockResolvedValue(undefined as never);
		const { userId: vendorUserId, vendorId, campusId } = await makeVendor();
		const o = await order({ vendorId, campusId, status: OrderStatus.PAID });

		const res = await cancelOrderAsVendor({
			vendorUserId,
			orderId: o.orderId,
			reason: "sold out",
		});
		expect(res.message).toMatch(/notified/i);
		expect(refundSpy).toHaveBeenCalledWith(o.ref, TOTAL);
		// The buyer of this order has no phone on record (oid buyer), so no SMS —
		// but the vendor path still completed. (A real buyer with a phone would.)
		expect(smsSpy).not.toHaveBeenCalled();
	});

	it("rejects a vendor cancelling another vendor's order", async () => {
		const a = await makeVendor();
		const b = await makeVendor();
		const o = await order({
			vendorId: a.vendorId,
			campusId: a.campusId,
			status: OrderStatus.PAID,
		});
		await expect(
			cancelOrderAsVendor({
				vendorUserId: b.userId,
				orderId: o.orderId,
				reason: "not mine",
			}),
		).rejects.toThrow();
	});

	it("rejects when the caller is not a vendor at all", async () => {
		const { vendorId, campusId } = await makeVendor();
		const o = await order({ vendorId, campusId, status: OrderStatus.PAID });
		await expect(
			cancelOrderAsVendor({
				vendorUserId: oid(),
				orderId: o.orderId,
				reason: "x",
			}),
		).rejects.toThrow();
	});
});
