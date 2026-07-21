// The two "start a Paystack transaction" entry points:
//   - initializeBuyerPayment  (authenticated buyer paying their own order)
//   - initializeExternalPayment ("Pay for Me" link, paid by a third party)
//
// Only the Paystack network boundary is mocked. Orders and payments are real rows
// in the scratch DB, so the guards (wrong status, amount drift, missing
// subaccount) and — critically — the synthetic-email construction are exercised
// for real.
//
// SECURITY REGRESSION (initializeBuyerPayment): the email sent to Paystack must be
// keyed on the internal userId, NEVER the buyer's decrypted phone. Leaking the
// phone here would cross a real identifier to a third party in clear.

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
	generateShareableToken,
} from "@/server/constants/orderNumber";
import {
	createBuyerOrderDB,
	createDailyOrderDB,
	createPaymentDB,
	createUserDB,
	DailyOrderStatus,
	FulfillmentType,
	getBuyerOrderByIdDB,
	OrderStatus,
	PaymentStatus,
	setDailyOrderStatusDB,
} from "@/server/models";
import { paystackProvider } from "@/server/providers";
import {
	cancelExternalPaymentRequest,
	getExternalPaymentRequest,
	initializeExternalPayment,
} from "@/server/services/payments/externalPaymentRequest";
import { initializeBuyerPayment } from "@/server/services/payments/initializeBuyerPayment";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeVendor } from "../helpers/factories";

const AMOUNT = 200000;
const TX = {
	access_code: "acc_test_123",
	authorization_url: "https://paystack.test/pay/acc_test_123",
	reference: "ref-ignored",
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

function orderItems() {
	return [
		{
			dailyOrderItemId: oid(),
			menuItemId: oid(),
			snapshotName: "Jollof",
			snapshotPriceKobo: AMOUNT,
			quantity: 1,
			subtotalKobo: AMOUNT,
			selectedOptions: [] as unknown[],
		},
	];
}

describe("initializeBuyerPayment — synthetic email must not leak the phone", () => {
	async function setup(localPhone: string) {
		const { vendorId, campusId } = await makeVendor({
			withSubaccount: true,
		});
		const buyer = await createUserDB({
			payload: {
				email: `buyer-${Date.now()}-${Math.random().toString(36).slice(2)}@prechop.test`,
				campusId,
				firstName: "Ada",
				lastName: "Buyer",
				phone: localPhone,
				groupIds: [],
			},
		});
		const buyerId = buyer!._id.toString();
		const order = await createBuyerOrderDB({
			payload: {
				orderNumber: generateOrderNumber(),
				dailyOrderId: oid(),
				vendorId,
				buyerId,
				campusId,
				status: OrderStatus.AWAITING_EXTERNAL_PAYMENT,
				fulfillmentType: FulfillmentType.PICKUP,
				subtotalKobo: AMOUNT,
				deliveryFeeKobo: 0,
				platformFeeKobo: 0,
				totalKobo: AMOUNT,
				items: orderItems(),
			} as never,
		});
		const orderId = order!._id.toString();
		const ref = generatePaystackRef();
		await createPaymentDB({
			payload: {
				buyerOrderId: orderId,
				buyerId,
				vendorId,
				paystackRef: ref,
				amountKobo: AMOUNT,
				platformFeeKobo: 0,
				vendorAmountKobo: AMOUNT,
				idempotencyKey: hash(ref),
				status: PaymentStatus.AWAITING_EXTERNAL_PAYMENT,
			} as never,
		});
		return { buyerId, orderId };
	}

	it("keys the Paystack email on the userId and never includes the phone digits", async () => {
		const localPhone = "08099887766"; // known, so we can prove it's absent
		const initSpy = vi
			.spyOn(paystackProvider, "initializeTransaction")
			.mockResolvedValue(TX as never);
		const { buyerId, orderId } = await setup(localPhone);

		const res = await initializeBuyerPayment({ buyerId, orderId });

		expect(res.paymentUrl).toBe(TX.authorization_url);
		expect(initSpy).toHaveBeenCalledTimes(1);
		const email = initSpy.mock.calls[0][0].email;
		// The whole point of the regression: userId in, phone nowhere.
		expect(email).toBe(`buyer-${buyerId}@prechop-orders.ng`);
		expect(email).toContain(buyerId);
		expect(email).not.toContain("99887766"); // the unique tail of the phone
		expect(email).not.toContain("234"); // no E.164 country code either
		// And the order advanced to PENDING_PAYMENT.
		const order = await getBuyerOrderByIdDB({ id: orderId });
		expect(order!.status).toBe(OrderStatus.PENDING_PAYMENT);
	});

	it("rejects when the buyer is not the order owner", async () => {
		vi.spyOn(paystackProvider, "initializeTransaction").mockResolvedValue(
			TX as never,
		);
		const { orderId } = await setup("08055443322");
		await expect(
			initializeBuyerPayment({ buyerId: oid(), orderId }),
		).rejects.toThrow();
	});

	it("rejects when the vendor has no subaccount configured", async () => {
		const initSpy = vi.spyOn(paystackProvider, "initializeTransaction");
		// Vendor WITHOUT a subaccount.
		const { vendorId, campusId } = await makeVendor({
			withSubaccount: false,
		});
		const buyer = await createUserDB({
			payload: {
				email: `buyer-nosub-${Date.now()}-${Math.random().toString(36).slice(2)}@prechop.test`,
				campusId,
				firstName: "No",
				lastName: "Subaccount",
				phone: "08011112222",
				groupIds: [],
			},
		});
		const buyerId = buyer!._id.toString();
		const order = await createBuyerOrderDB({
			payload: {
				orderNumber: generateOrderNumber(),
				dailyOrderId: oid(),
				vendorId,
				buyerId,
				campusId,
				status: OrderStatus.AWAITING_EXTERNAL_PAYMENT,
				fulfillmentType: FulfillmentType.PICKUP,
				subtotalKobo: AMOUNT,
				deliveryFeeKobo: 0,
				platformFeeKobo: 0,
				totalKobo: AMOUNT,
				items: orderItems(),
			} as never,
		});
		const orderId = order!._id.toString();
		const ref = generatePaystackRef();
		await createPaymentDB({
			payload: {
				buyerOrderId: orderId,
				buyerId,
				vendorId,
				paystackRef: ref,
				amountKobo: AMOUNT,
				platformFeeKobo: 0,
				vendorAmountKobo: AMOUNT,
				idempotencyKey: hash(ref),
				status: PaymentStatus.AWAITING_EXTERNAL_PAYMENT,
			} as never,
		});

		await expect(
			initializeBuyerPayment({ buyerId, orderId }),
		).rejects.toThrow(/payment account is not configured/i);
		// Paystack must never be reached when the vendor can't be paid.
		expect(initSpy).not.toHaveBeenCalled();
	});

	it("rejects an order that can no longer be paid (already PAID)", async () => {
		const initSpy = vi.spyOn(paystackProvider, "initializeTransaction");
		const { buyerId, orderId } = await setup("08033334444");
		// Flip the order to PAID.
		const mongoose = (await import("mongoose")).default;
		await mongoose.connection
			.db!.collection("buyerorders")
			.updateOne(
				{ _id: new mongoose.Types.ObjectId(orderId) },
				{ $set: { status: OrderStatus.PAID } },
			);
		await expect(
			initializeBuyerPayment({ buyerId, orderId }),
		).rejects.toThrow(/no longer be paid/i);
		expect(initSpy).not.toHaveBeenCalled();
	});
});

describe("external payment request (Pay for Me)", () => {
	async function setupExternal({
		expiresInMs = 30 * 60 * 1000,
		status = OrderStatus.AWAITING_EXTERNAL_PAYMENT,
		amountKobo = AMOUNT,
	}: {
		expiresInMs?: number;
		status?: OrderStatus;
		amountKobo?: number;
	} = {}) {
		const { vendorId, campusId } = await makeVendor({
			withSubaccount: true,
		});
		const buyerId = oid();
		// A REAL, still-open listing: expireIfNeeded treats a missing or CLOSED
		// listing as reason to cancel the request, so the order must point at an
		// ACTIVE one for the "still awaiting" paths to be reachable.
		const listing = await createDailyOrderDB({
			payload: {
				vendorId,
				campusId,
				shareableToken: generateShareableToken(),
				title: "Lunch",
				scheduledDate: new Date(Date.now() + 3_600_000),
				cutoffTime: new Date(Date.now() + 1_800_000),
				pickupAvailable: true,
				items: [
					{
						menuItemId: oid(),
						snapshotName: "Jollof",
						snapshotPriceKobo: AMOUNT,
						snapshotPrepMin: 20,
						maxQuantity: 10,
					},
				],
			},
		});
		await setDailyOrderStatusDB({
			id: listing!._id.toString(),
			vendorId,
			status: DailyOrderStatus.ACTIVE,
		});
		const order = await createBuyerOrderDB({
			payload: {
				orderNumber: generateOrderNumber(),
				dailyOrderId: listing!._id.toString(),
				vendorId,
				buyerId,
				campusId,
				status,
				fulfillmentType: FulfillmentType.PICKUP,
				subtotalKobo: AMOUNT,
				deliveryFeeKobo: 0,
				platformFeeKobo: 6000,
				totalKobo: AMOUNT,
				items: orderItems(),
			} as never,
		});
		const orderId = order!._id.toString();
		const token = `tok_${Math.random().toString(36).slice(2)}`;
		const ref = generatePaystackRef();
		await createPaymentDB({
			payload: {
				buyerOrderId: orderId,
				buyerId,
				vendorId,
				paystackRef: ref,
				amountKobo,
				platformFeeKobo: 6000,
				vendorAmountKobo: AMOUNT,
				idempotencyKey: hash(ref),
				status: PaymentStatus.AWAITING_EXTERNAL_PAYMENT,
				externalPaymentTokenHash: hash(token),
				externalPaymentExpiresAt: new Date(Date.now() + expiresInMs),
			} as never,
		});
		return { orderId, token, ref, buyerId };
	}

	it("summarises an active request as AWAITING_EXTERNAL_PAYMENT", async () => {
		const { token } = await setupExternal();
		const summary = await getExternalPaymentRequest(token);
		expect(summary.status).toBe("AWAITING_EXTERNAL_PAYMENT");
		expect(summary.orderNumber).toBeTruthy();
		expect(summary.totalKobo).toBe(AMOUNT);
		expect(summary.items[0].name).toBe("Jollof");
	});

	it("throws for an unknown token", async () => {
		await expect(getExternalPaymentRequest("nope")).rejects.toThrow();
	});

	it("initializes Paystack and synthesises a payer email from a phone contact", async () => {
		const initSpy = vi
			.spyOn(paystackProvider, "initializeTransaction")
			.mockResolvedValue(TX as never);
		const { token } = await setupExternal();

		const res = await initializeExternalPayment({
			token,
			contact: "0803 123 4567",
		});
		expect(res.paymentUrl).toBe(TX.authorization_url);
		// A non-email contact becomes payer-{digits}@prechop-pay.ng.
		expect(initSpy.mock.calls[0][0].email).toBe(
			"payer-08031234567@prechop-pay.ng",
		);
	});

	it("passes a real email contact straight through", async () => {
		const initSpy = vi
			.spyOn(paystackProvider, "initializeTransaction")
			.mockResolvedValue(TX as never);
		const { token } = await setupExternal();
		await initializeExternalPayment({
			token,
			contact: "payer@example.com",
		});
		expect(initSpy.mock.calls[0][0].email).toBe("payer@example.com");
	});

	it("expires an overdue request and refuses to initialize it", async () => {
		const initSpy = vi.spyOn(paystackProvider, "initializeTransaction");
		const { token, orderId } = await setupExternal({ expiresInMs: -1000 });

		// Reading it flips the expired request to cancelled/expired.
		const summary = await getExternalPaymentRequest(token);
		expect(summary.status).toBe("EXPIRED");

		await expect(
			initializeExternalPayment({ token, contact: "0803 123 4567" }),
		).rejects.toThrow(/no longer active/i);
		expect(initSpy).not.toHaveBeenCalled();

		const order = await getBuyerOrderByIdDB({ id: orderId });
		expect(order!.status).toBe(OrderStatus.CANCELLED);
	});

	it("lets the owning buyer cancel their pending request", async () => {
		const { token, orderId, buyerId } = await setupExternal();
		const res = await cancelExternalPaymentRequest({
			buyerId,
			orderId,
			reason: "changed my mind",
		});
		expect(res.message).toMatch(/cancelled/i);
		const order = await getBuyerOrderByIdDB({ id: orderId });
		expect(order!.status).toBe(OrderStatus.CANCELLED);
		// Reading it now reports CANCELLED, not AWAITING.
		const summary = await getExternalPaymentRequest(token);
		expect(summary.status).toBe("CANCELLED");
	});

	it("refuses a cancel from someone who isn't the buyer", async () => {
		const { orderId } = await setupExternal();
		await expect(
			cancelExternalPaymentRequest({
				buyerId: oid(),
				orderId,
				reason: "not mine",
			}),
		).rejects.toThrow();
	});
});
