import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
	calculateBuyerServiceFeeKobo,
	calculateVendorCommissionKobo,
} from "@/constants/fees";
import { generateShareableToken } from "@/server/constants/orderNumber";
import { Redis } from "@/server/databases/redis";
import { getBuyerOrderByIdDB } from "@/server/models/buyerOrders";
import {
	createDailyOrderDB,
	setDailyOrderStatusDB,
} from "@/server/models/dailyOrders";
import {
	DailyOrderStatus,
	FulfillmentType,
	OrderStatus,
	PaymentStatus,
} from "@/server/models/enums";
import { getPaymentByOrderIdDB } from "@/server/models/payments";
import {
	createVendorProfileDB,
	updateVendorProfileDB,
} from "@/server/models/vendorProfiles";
import { paystackProvider } from "@/server/providers/paystack";
import { placeOrder } from "@/server/services/buyerOrders/placeOrder";
import { initializeBuyerPayment } from "@/server/services/payments";
import { invalidateSiteConfigsCache } from "@/server/services/siteConfigs/getSiteConfigs";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";

const slotKeys = new Set<string>();

beforeAll(async () => {
	await connectTestDB();
	invalidateSiteConfigsCache();
	vi.spyOn(paystackProvider, "initializeTransaction").mockResolvedValue({
		authorization_url: "https://paystack.test/pay/abc",
		access_code: "acc_123",
		reference: "ref_123",
	});
});

afterAll(async () => {
	vi.restoreAllMocks();
	invalidateSiteConfigsCache();
	if (slotKeys.size) await Redis.del(...slotKeys);
	await dropAndDisconnect();
});

async function activeListing({
	maxQuantity = 10,
	campusId,
	availableFrom,
}: {
	maxQuantity?: number | null;
	campusId: string;
	availableFrom?: Date;
}) {
	const vendor = await createVendorProfileDB({
		payload: {
			userId: oid(),
			campusId,
			email: `v-${Math.random().toString(36).slice(2)}@prechop.test`,
		},
	});
	const vendorId = vendor!._id.toString();
	await updateVendorProfileDB({
		id: vendorId,
		payload: {
			paystackSubaccountCode: "ACCT_test123",
			isOpenForOrders: true,
		},
	});

	const listing = await createDailyOrderDB({
		payload: {
			vendorId,
			campusId,
			shareableToken: generateShareableToken(),
			title: "Lunch",
			scheduledDate: new Date(Date.now() + 3_600_000),
			availableFrom,
			cutoffTime: new Date(Date.now() + 1_800_000),
			pickupAvailable: true,
			items: [
				{
					menuItemId: oid(),
					snapshotName: "Jollof",
					snapshotPriceKobo: 150000,
					snapshotPrepMin: 20,
					maxQuantity,
				},
			],
		},
	});
	await setDailyOrderStatusDB({
		id: listing!._id.toString(),
		vendorId,
		status: DailyOrderStatus.ACTIVE,
	});
	const itemId = listing!.items[0]._id!.toString();
	slotKeys.add(`slot:reserved:${itemId}`);
	return { listing: listing!, vendorId, itemId };
}

describe("placeOrder service", () => {
	it("places a pickup order end to end (order + payment persisted)", async () => {
		const campusId = oid();
		const buyerId = oid();
		const { listing, itemId } = await activeListing({ campusId });

		const result = await placeOrder({
			buyerId,
			campusId,
			input: {
				dailyOrderId: listing._id.toString(),
				fulfillmentType: FulfillmentType.PICKUP,
				items: [{ dailyOrderItemId: itemId, quantity: 2 }],
			},
		});

		expect(result.orderNumber).toMatch(/^PCH-/);
		expect(result.paymentUrl).toBe("https://paystack.test/pay/abc");
		const subtotalKobo = 300000;
		const processingFee = calculateBuyerServiceFeeKobo(subtotalKobo);
		const commission = calculateVendorCommissionKobo(subtotalKobo);
		const vendorSettlement = subtotalKobo - commission;
		expect(result.totalKobo).toBe(subtotalKobo + processingFee);

		const order = await getBuyerOrderByIdDB({ id: result.buyerOrderId });
		expect(order).not.toBeNull();
		expect(order!.subtotalKobo).toBe(subtotalKobo);
		expect(order!.paymentProcessingFeeKobo).toBe(processingFee);
		expect(order!.prechopCommissionKobo).toBe(commission);
		expect(order!.vendorSettlementKobo).toBe(vendorSettlement);

		const payment = await getPaymentByOrderIdDB({
			buyerOrderId: result.buyerOrderId,
		});
		expect(payment).not.toBeNull();
		expect(payment!.amountKobo).toBe(subtotalKobo + processingFee);
		expect(payment!.platformFeeKobo).toBe(commission);
		expect(payment!.paymentProcessingFeeKobo).toBe(processingFee);
		expect(payment!.vendorAmountKobo).toBe(vendorSettlement);
	});

	it("creates a pay-for-me order without initializing Paystack immediately", async () => {
		vi.mocked(paystackProvider.initializeTransaction).mockClear();
		const campusId = oid();
		const buyerId = oid();
		const { listing, itemId } = await activeListing({ campusId });

		const result = await placeOrder({
			buyerId,
			campusId,
			input: {
				dailyOrderId: listing._id.toString(),
				paymentMode: "PAY_FOR_ME",
				fulfillmentType: FulfillmentType.PICKUP,
				items: [{ dailyOrderItemId: itemId, quantity: 1 }],
			},
		});

		expect(paystackProvider.initializeTransaction).not.toHaveBeenCalled();
		expect(result.paymentUrl).toBeUndefined();
		expect(result.externalPaymentUrl).toMatch(/\/pay\//);
		expect(result.externalPaymentExpiresAt).toBeTruthy();

		const order = await getBuyerOrderByIdDB({ id: result.buyerOrderId });
		expect(order!.status).toBe(OrderStatus.AWAITING_EXTERNAL_PAYMENT);

		const payment = await getPaymentByOrderIdDB({
			buyerOrderId: result.buyerOrderId,
		});
		expect(payment!.status).toBe(PaymentStatus.AWAITING_EXTERNAL_PAYMENT);
		expect(payment!.externalPaymentTokenHash).toBeTruthy();
		expect(payment!.paystackAccessCode).toBeUndefined();
	});

	it("lets the buyer pay a pay-for-me order through the normal Paystack flow", async () => {
		vi.mocked(paystackProvider.initializeTransaction).mockClear();
		const campusId = oid();
		const buyerId = oid();
		const { listing, itemId } = await activeListing({ campusId });

		const result = await placeOrder({
			buyerId,
			campusId,
			input: {
				dailyOrderId: listing._id.toString(),
				paymentMode: "PAY_FOR_ME",
				fulfillmentType: FulfillmentType.PICKUP,
				items: [{ dailyOrderItemId: itemId, quantity: 1 }],
			},
		});

		const payment = await getPaymentByOrderIdDB({
			buyerOrderId: result.buyerOrderId,
		});
		expect(payment!.externalPaymentTokenHash).toBeTruthy();

		const pay = await initializeBuyerPayment({
			buyerId,
			orderId: result.buyerOrderId,
		});

		expect(pay.paymentUrl).toBe("https://paystack.test/pay/abc");
		expect(pay.paystackRef).toBe(payment!.paystackRef);
		expect(paystackProvider.initializeTransaction).toHaveBeenCalledOnce();

		const updatedOrder = await getBuyerOrderByIdDB({
			id: result.buyerOrderId,
		});
		expect(updatedOrder!.status).toBe(OrderStatus.PENDING_PAYMENT);

		const updatedPayment = await getPaymentByOrderIdDB({
			buyerOrderId: result.buyerOrderId,
		});
		expect(updatedPayment!.status).toBe(PaymentStatus.INITIALIZED);
		expect(updatedPayment!.paystackAuthorizationUrl).toBe(
			"https://paystack.test/pay/abc",
		);
		expect(updatedPayment!.externalPaymentTokenHash).toBeUndefined();

		const repeat = await initializeBuyerPayment({
			buyerId,
			orderId: result.buyerOrderId,
		});
		expect(repeat.paymentUrl).toBe("https://paystack.test/pay/abc");
		expect(paystackProvider.initializeTransaction).toHaveBeenCalledOnce();
	});

	it("rejects a non-active listing", async () => {
		const campusId = oid();
		const vendor = await createVendorProfileDB({
			payload: { userId: oid(), campusId, email: `v-${oid()}@t.test` },
		});
		const draft = await createDailyOrderDB({
			payload: {
				vendorId: vendor!._id.toString(),
				campusId,
				shareableToken: generateShareableToken(),
				title: "Draft",
				scheduledDate: new Date(Date.now() + 3_600_000),
				cutoffTime: new Date(Date.now() + 1_800_000),
				items: [
					{
						menuItemId: oid(),
						snapshotName: "X",
						snapshotPriceKobo: 1000,
						snapshotPrepMin: 20,
					},
				],
			},
		});
		await expect(
			placeOrder({
				buyerId: oid(),
				campusId,
				input: {
					dailyOrderId: draft!._id.toString(),
					fulfillmentType: FulfillmentType.PICKUP,
					items: [
						{
							dailyOrderItemId: draft!.items[0]._id!.toString(),
							quantity: 1,
						},
					],
				},
			}),
		).rejects.toThrow();
	});

	it("blocks an oversell request via slot reservation", async () => {
		const campusId = oid();
		const { listing, itemId } = await activeListing({
			campusId,
			maxQuantity: 1,
		});
		await expect(
			placeOrder({
				buyerId: oid(),
				campusId,
				input: {
					dailyOrderId: listing._id.toString(),
					fulfillmentType: FulfillmentType.PICKUP,
					items: [{ dailyOrderItemId: itemId, quantity: 5 }],
				},
			}),
		).rejects.toThrow(/sold out/i);
	});

	it("rejects a 'coming soon' listing whose start time is in the future", async () => {
		const campusId = oid();
		const { listing, itemId } = await activeListing({
			campusId,
			availableFrom: new Date(Date.now() + 3_600_000), // opens in 1h
		});
		await expect(
			placeOrder({
				buyerId: oid(),
				campusId,
				input: {
					dailyOrderId: listing._id.toString(),
					fulfillmentType: FulfillmentType.PICKUP,
					items: [{ dailyOrderItemId: itemId, quantity: 1 }],
				},
			}),
		).rejects.toThrow(/hasn't opened|opened for this listing/i);
	});

	it("allows ordering once the start time has passed", async () => {
		const campusId = oid();
		const buyerId = oid();
		const { listing, itemId } = await activeListing({
			campusId,
			availableFrom: new Date(Date.now() - 60_000), // opened 1 min ago
		});
		const result = await placeOrder({
			buyerId,
			campusId,
			input: {
				dailyOrderId: listing._id.toString(),
				fulfillmentType: FulfillmentType.PICKUP,
				items: [{ dailyOrderItemId: itemId, quantity: 1 }],
			},
		});
		expect(result.orderNumber).toMatch(/^PCH-/);
	});

	it("rejects an unknown daily order", async () => {
		await expect(
			placeOrder({
				buyerId: oid(),
				campusId: oid(),
				input: {
					dailyOrderId: oid(),
					fulfillmentType: FulfillmentType.PICKUP,
					items: [{ dailyOrderItemId: oid(), quantity: 1 }],
				},
			}),
		).rejects.toThrow();
	});
});
