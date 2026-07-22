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
import { Redis } from "@/server/databases/redis";
import {
	claimPaymentWebhookDB,
	createPaymentDB,
	PaymentStatus,
} from "@/server/models";
import {
	createBuyerOrderDB,
	getBuyerOrderByIdDB,
	setBuyerOrderStatusDB,
} from "@/server/models/buyerOrders";
import { FulfillmentType, OrderStatus } from "@/server/models/enums";
import { listNotificationsDB } from "@/server/models/notifications";
import { paystackProvider } from "@/server/providers";
import { cancelOrderAsBuyer } from "@/server/services/buyerOrders/cancel";
import {
	isNoShowOrFailedDeliveryFinanciallySettled,
	markDeliveryFailed,
	reportBuyerUnreachable,
	reportPickupNoShow,
	respondToPickupNoShow,
	sweepPickupNoShowTimers,
} from "@/server/services/buyerOrders/exceptions";
import {
	confirmOrderHandover,
	getBuyerHandoverCredential,
} from "@/server/services/buyerOrders/handoverConfirmation";
import {
	getMyOrders,
	getOrderById,
	getVendorOrdersForDailyOrder,
} from "@/server/services/buyerOrders/queries";
import { updateOrderStatus } from "@/server/services/buyerOrders/updateStatus";
import { sweepVendorAcceptanceDeadlines } from "@/server/services/buyerOrders/vendorAcceptance";
import { createReview } from "@/server/services/reviews/create";
import { getReviewForOrder } from "@/server/services/reviews/queries";
import { reportReview } from "@/server/services/reviews/report";
import { invalidateSiteConfigsCache } from "@/server/services/siteConfigs/getSiteConfigs";
import { updateSiteConfigs } from "@/server/services/siteConfigs/updateSiteConfigs";
import { getVendorReviews } from "@/server/services/vendors/reviews";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeUser, makeVendor } from "../helpers/factories";

const slotKeys = new Set<string>();

beforeAll(async () => {
	await connectTestDB();
	invalidateSiteConfigsCache();
});

afterEach(() => {
	vi.restoreAllMocks();
});

afterAll(async () => {
	invalidateSiteConfigsCache();
	if (slotKeys.size) await Redis.del(...slotKeys);
	await dropAndDisconnect();
});

async function makeOrder({
	vendorId,
	buyerId,
	campusId,
	status,
	fulfillmentType = FulfillmentType.PICKUP,
	acceptanceDeadline,
}: {
	vendorId: string;
	buyerId: string;
	campusId: string;
	status?: OrderStatus;
	fulfillmentType?: FulfillmentType;
	acceptanceDeadline?: Date;
}) {
	const itemId = oid();
	slotKeys.add(`slot:reserved:${itemId}`);
	const order = await createBuyerOrderDB({
		payload: {
			orderNumber: generateOrderNumber(),
			dailyOrderId: oid(),
			vendorId,
			buyerId,
			campusId,
			fulfillmentType,
			subtotalKobo: 150000,
			deliveryFeeKobo: 0,
			platformFeeKobo: 5000,
			totalKobo: 155000,
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
	if (status && status !== OrderStatus.PENDING_PAYMENT) {
		await setBuyerOrderStatusDB({
			id: order!._id.toString(),
			status,
			acceptanceDeadline,
		});
	}
	return order!;
}

async function addSuccessfulPayment(
	order: Awaited<ReturnType<typeof makeOrder>>,
) {
	const ref = generatePaystackRef();
	await createPaymentDB({
		payload: {
			buyerOrderId: order._id.toString(),
			buyerId: order.buyerId.toString(),
			vendorId: order.vendorId.toString(),
			paystackRef: ref,
			amountKobo: order.totalKobo,
			platformFeeKobo: order.platformFeeKobo,
			vendorAmountKobo: order.vendorSettlementKobo || order.subtotalKobo,
			idempotencyKey: hash(ref),
			status: PaymentStatus.SUCCESS,
		},
	});
	await claimPaymentWebhookDB({ paystackRef: ref, channel: "card" });
	return ref;
}

describe("buyerOrders queries", () => {
	it("getMyOrders / getOrderById enforce ownership", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({ vendorId, buyerId, campusId });

		expect((await getMyOrders({ buyerId })).length).toBe(1);
		const fetched = await getOrderById({
			userId: buyerId,
			orderId: order._id.toString(),
		});
		expect(fetched._id.toString()).toBe(order._id.toString());

		// a stranger cannot view it
		await expect(
			getOrderById({ userId: oid(), orderId: order._id.toString() }),
		).rejects.toThrow();
	});

	it("getVendorOrdersForDailyOrder returns the vendor's paid orders", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.PAID,
		});
		const list = await getVendorOrdersForDailyOrder({
			vendorUserId: userId,
			dailyOrderId: order.dailyOrderId.toString(),
		});
		expect(list.length).toBe(1);
	});
});

describe("updateOrderStatus", () => {
	it("accepts an awaiting order and starts cooking", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.AWAITING_VENDOR_ACCEPTANCE,
			acceptanceDeadline: new Date(Date.now() + 10 * 60 * 1000),
		});

		const accepted = await updateOrderStatus({
			vendorUserId: userId,
			orderId: order._id.toString(),
			status: OrderStatus.ACCEPTED,
		});

		expect(accepted.status).toBe(OrderStatus.COOKING);
		expect(accepted.acceptedAt).toBeInstanceOf(Date);
		const notifications = await listNotificationsDB({
			userId: buyer!._id.toString(),
		});
		expect(notifications.some((n) => n.type === "ORDER_ACCEPTED")).toBe(
			true,
		);
	});

	it("rejects an awaiting order and starts one refund", async () => {
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({ id: 444, status: "success", amount: 155000 });
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.AWAITING_VENDOR_ACCEPTANCE,
			acceptanceDeadline: new Date(Date.now() + 10 * 60 * 1000),
		});
		await addSuccessfulPayment(order);

		const rejected = await updateOrderStatus({
			vendorUserId: userId,
			orderId: order._id.toString(),
			status: OrderStatus.VENDOR_REJECTED,
		});

		expect(rejected.status).toBe(OrderStatus.REFUNDED);
		expect(refundSpy).toHaveBeenCalledTimes(1);
		const notifications = await listNotificationsDB({
			userId: buyer!._id.toString(),
		});
		expect(
			notifications.some((n) => n.type === "ORDER_REFUND_PENDING"),
		).toBe(true);
	});

	it("expires unanswered orders and is idempotent on duplicate timer execution", async () => {
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({ id: 445, status: "success", amount: 155000 });
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.AWAITING_VENDOR_ACCEPTANCE,
			acceptanceDeadline: new Date(Date.now() - 1000),
		});
		await addSuccessfulPayment(order);

		const first = await sweepVendorAcceptanceDeadlines();
		const second = await sweepVendorAcceptanceDeadlines();

		expect(first.expired).toBeGreaterThanOrEqual(1);
		expect(second.expired).toBe(0);
		expect(refundSpy).toHaveBeenCalledTimes(1);
		const expired = await getBuyerOrderByIdDB({
			id: order._id.toString(),
		});
		expect(expired!.status).toBe(OrderStatus.REFUNDED);
	});

	it("prevents acceptance after expiry", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.EXPIRED_VENDOR_NO_RESPONSE,
		});

		await expect(
			updateOrderStatus({
				vendorUserId: userId,
				orderId: order._id.toString(),
				status: OrderStatus.ACCEPTED,
			}),
		).rejects.toThrow();
	});

	it("keeps refund idempotent when rejection is retried after refund", async () => {
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({ id: 446, status: "success", amount: 155000 });
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.AWAITING_VENDOR_ACCEPTANCE,
			acceptanceDeadline: new Date(Date.now() + 10 * 60 * 1000),
		});
		await addSuccessfulPayment(order);

		await updateOrderStatus({
			vendorUserId: userId,
			orderId: order._id.toString(),
			status: OrderStatus.VENDOR_REJECTED,
		});
		await expect(
			updateOrderStatus({
				vendorUserId: userId,
				orderId: order._id.toString(),
				status: OrderStatus.VENDOR_REJECTED,
			}),
		).rejects.toThrow();

		expect(refundSpy).toHaveBeenCalledTimes(1);
	});

	it("prevents cooking before successful payment", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.PENDING_PAYMENT,
		});

		await expect(
			updateOrderStatus({
				vendorUserId: userId,
				orderId: order._id.toString(),
				status: OrderStatus.ACCEPTED,
			}),
		).rejects.toThrow();
	});

	it("advances through the valid transition chain", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.PAID,
		});
		const orderId = order._id.toString();
		const confirmed = await updateOrderStatus({
			vendorUserId: userId,
			orderId,
			status: OrderStatus.CONFIRMED,
		});
		expect(confirmed.status).toBe(OrderStatus.CONFIRMED);
		const preparing = await updateOrderStatus({
			vendorUserId: userId,
			orderId,
			status: OrderStatus.PREPARING,
		});
		expect(preparing.status).toBe(OrderStatus.PREPARING);
	});

	it("requires delivery orders to pass through in transit", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.READY,
			fulfillmentType: FulfillmentType.DELIVERY,
		});
		const orderId = order._id.toString();
		await addSuccessfulPayment(order);

		await expect(
			updateOrderStatus({
				vendorUserId: userId,
				orderId,
				status: OrderStatus.COMPLETED,
			}),
		).rejects.toThrow();

		const inTransit = await updateOrderStatus({
			vendorUserId: userId,
			orderId,
			status: OrderStatus.IN_TRANSIT,
		});
		expect(inTransit.status).toBe(OrderStatus.IN_TRANSIT);
		expect(inTransit.deliveryStartedAt).toBeInstanceOf(Date);

		for (let i = 0; i < 10; i += 1) {
			const notifications = await listNotificationsDB({
				userId: buyerId,
			});
			if (
				notifications.some(
					(n) =>
						n.type === "ORDER_IN_TRANSIT" &&
						n.body === "Your order is on the way.",
				)
			) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		const notifications = await listNotificationsDB({ userId: buyerId });
		expect(
			notifications.some(
				(n) =>
					n.type === "ORDER_IN_TRANSIT" &&
					n.body === "Your order is on the way.",
			),
		).toBe(true);

		const credential = await getBuyerHandoverCredential({
			buyerId,
			orderId,
		});
		const completed = await confirmOrderHandover({
			vendorUserId: userId,
			orderId,
			method: "PIN",
			code: credential.pin,
		});
		expect(completed.status).toBe(OrderStatus.COMPLETED);
	});

	it("keeps in-transit unavailable for pickup orders", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.READY,
			fulfillmentType: FulfillmentType.PICKUP,
		});

		await expect(
			updateOrderStatus({
				vendorUserId: userId,
				orderId: order._id.toString(),
				status: OrderStatus.IN_TRANSIT,
			}),
		).rejects.toThrow();

		const unchanged = await getBuyerOrderByIdDB({
			id: order._id.toString(),
		});
		expect(unchanged!.deliveryStartedAt).toBeUndefined();
	});

	it("rejects an illegal transition", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.PAID,
		});
		await expect(
			updateOrderStatus({
				vendorUserId: userId,
				orderId: order._id.toString(),
				status: OrderStatus.READY,
			}),
		).rejects.toThrow();
	});

	it("rejects a non-owning vendor", async () => {
		const owner = await makeVendor();
		const other = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId: owner.vendorId,
			buyerId: buyer!._id.toString(),
			campusId: owner.campusId,
			status: OrderStatus.PAID,
		});
		await expect(
			updateOrderStatus({
				vendorUserId: other.userId,
				orderId: order._id.toString(),
				status: OrderStatus.CONFIRMED,
			}),
		).rejects.toThrow();
	});
});

describe("handover confirmation", () => {
	it("confirms pickup with the correct PIN", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.READY,
			fulfillmentType: FulfillmentType.PICKUP,
		});
		await addSuccessfulPayment(order);

		const credential = await getBuyerHandoverCredential({
			buyerId,
			orderId: order._id.toString(),
		});
		const completed = await confirmOrderHandover({
			vendorUserId: userId,
			orderId: order._id.toString(),
			method: "PIN",
			code: credential.pin,
		});

		expect(completed.status).toBe(OrderStatus.COMPLETED);
		expect(completed.confirmationMethod).toBe("PIN");
		expect(completed.pickedUpAt).toBeInstanceOf(Date);
	});

	it("rejects a wrong PIN and locks after repeated failures", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.READY,
		});
		await addSuccessfulPayment(order);

		for (let i = 0; i < 5; i += 1) {
			await expect(
				confirmOrderHandover({
					vendorUserId: userId,
					orderId: order._id.toString(),
					method: "PIN",
					code: "000000",
				}),
			).rejects.toThrow();
		}
		const locked = await getBuyerOrderByIdDB({
			id: order._id.toString(),
		});
		expect(locked!.handoverFailedAttempts).toBe(5);
		expect(locked!.handoverLockedUntil).toBeInstanceOf(Date);
	});

	it("rejects reused PIN and repeated confirmation", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.READY,
		});
		await addSuccessfulPayment(order);
		const credential = await getBuyerHandoverCredential({
			buyerId,
			orderId: order._id.toString(),
		});

		await confirmOrderHandover({
			vendorUserId: userId,
			orderId: order._id.toString(),
			method: "PIN",
			code: credential.pin,
		});
		await expect(
			confirmOrderHandover({
				vendorUserId: userId,
				orderId: order._id.toString(),
				method: "PIN",
				code: credential.pin,
			}),
		).rejects.toThrow();
	});

	it("rejects the wrong vendor", async () => {
		const { vendorId, campusId } = await makeVendor();
		const other = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.READY,
		});
		await addSuccessfulPayment(order);
		const credential = await getBuyerHandoverCredential({
			buyerId,
			orderId: order._id.toString(),
		});

		await expect(
			confirmOrderHandover({
				vendorUserId: other.userId,
				orderId: order._id.toString(),
				method: "PIN",
				code: credential.pin,
			}),
		).rejects.toThrow();
	});

	it("rejects the wrong order status", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.COOKING,
		});
		await addSuccessfulPayment(order);

		await expect(
			getBuyerHandoverCredential({
				buyerId: buyer!._id.toString(),
				orderId: order._id.toString(),
			}),
		).rejects.toThrow();
		await expect(
			confirmOrderHandover({
				vendorUserId: userId,
				orderId: order._id.toString(),
				method: "PIN",
				code: "123456",
			}),
		).rejects.toThrow();
	});

	it("confirms delivery with QR", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.IN_TRANSIT,
			fulfillmentType: FulfillmentType.DELIVERY,
		});
		await addSuccessfulPayment(order);
		const credential = await getBuyerHandoverCredential({
			buyerId,
			orderId: order._id.toString(),
		});

		const completed = await confirmOrderHandover({
			vendorUserId: userId,
			orderId: order._id.toString(),
			method: "QR",
			code: credential.qrToken,
		});

		expect(completed.status).toBe(OrderStatus.COMPLETED);
		expect(completed.confirmationMethod).toBe("QR");
		expect(completed.deliveredAt).toBeInstanceOf(Date);
	});
});

describe("pickup no-show and failed delivery", () => {
	it("sends pickup reminders at 60 and 90 minutes and enables reporting at 120", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.READY,
			fulfillmentType: FulfillmentType.PICKUP,
		});
		const readyAt = new Date("2026-07-22T08:00:00.000Z");
		await setBuyerOrderStatusDB({
			id: order._id.toString(),
			status: OrderStatus.READY,
			readyAt,
		});

		let result = await sweepPickupNoShowTimers({
			now: new Date("2026-07-22T09:00:00.000Z"),
		});
		expect(result.reminder60).toBe(1);
		expect(result.warning90).toBe(0);
		expect(result.reportEnabled).toBe(0);

		result = await sweepPickupNoShowTimers({
			now: new Date("2026-07-22T09:30:00.000Z"),
		});
		expect(result.reminder60).toBe(0);
		expect(result.warning90).toBe(1);
		expect(result.reportEnabled).toBe(0);

		result = await sweepPickupNoShowTimers({
			now: new Date("2026-07-22T10:00:00.000Z"),
		});
		expect(result.reportEnabled).toBe(1);

		const fresh = await getBuyerOrderByIdDB({ id: order._id.toString() });
		expect(fresh!.pickupReminder60SentAt).toBeInstanceOf(Date);
		expect(fresh!.pickupWarning90SentAt).toBeInstanceOf(Date);
		expect(fresh!.pickupNoShowReportableAt).toBeInstanceOf(Date);
		expect(fresh!.timeline?.map((entry) => entry.type)).toEqual(
			expect.arrayContaining([
				"PICKUP_REMINDER_60_SENT",
				"PICKUP_WARNING_90_SENT",
				"PICKUP_NO_SHOW_REPORT_ENABLED",
			]),
		);
	});

	it("blocks pickup no-show reporting before 120 minutes", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.READY,
			fulfillmentType: FulfillmentType.PICKUP,
		});
		await setBuyerOrderStatusDB({
			id: order._id.toString(),
			status: OrderStatus.READY,
			readyAt: new Date("2026-07-22T08:00:00.000Z"),
		});

		await expect(
			reportPickupNoShow({
				vendorUserId: userId,
				orderId: order._id.toString(),
				now: new Date("2026-07-22T09:59:00.000Z"),
			}),
		).rejects.toThrow();
	});

	it("moves pickup no-show to buyer response, then completes after no response without refund", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.READY,
			fulfillmentType: FulfillmentType.PICKUP,
		});
		await setBuyerOrderStatusDB({
			id: order._id.toString(),
			status: OrderStatus.READY,
			readyAt: new Date("2026-07-22T08:00:00.000Z"),
		});

		const reported = await reportPickupNoShow({
			vendorUserId: userId,
			orderId: order._id.toString(),
			now: new Date("2026-07-22T10:00:00.000Z"),
		});
		expect(reported.status).toBe(
			OrderStatus.AWAITING_BUYER_NO_SHOW_RESPONSE,
		);
		expect(reported.pickupBuyerResponseDeadline).toEqual(
			new Date("2026-07-22T10:15:00.000Z"),
		);

		const result = await sweepPickupNoShowTimers({
			now: new Date("2026-07-22T10:16:00.000Z"),
		});
		expect(result.completedNoResponse).toBe(1);
		const completed = await getBuyerOrderByIdDB({
			id: order._id.toString(),
		});
		expect(completed!.status).toBe(OrderStatus.COMPLETED_BUYER_NO_SHOW);
		expect(completed!.refundPendingAt).toBeUndefined();
		expect(
			isNoShowOrFailedDeliveryFinanciallySettled(
				completed!.status as OrderStatus,
			),
		).toBe(true);
		expect(completed!.timeline?.map((entry) => entry.type)).toContain(
			"BUYER_NO_SHOW_COMPLETED_NO_RESPONSE",
		);
	});

	it("lets the buyer confirm collection or report a pickup problem during the response window", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const collected = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.READY,
			fulfillmentType: FulfillmentType.PICKUP,
		});
		await setBuyerOrderStatusDB({
			id: collected._id.toString(),
			status: OrderStatus.READY,
			readyAt: new Date("2026-07-22T08:00:00.000Z"),
		});
		await reportPickupNoShow({
			vendorUserId: userId,
			orderId: collected._id.toString(),
			now: new Date("2026-07-22T10:00:00.000Z"),
		});
		const confirmed = await respondToPickupNoShow({
			buyerId,
			orderId: collected._id.toString(),
			response: "CONFIRMED_COLLECTION",
			now: new Date("2026-07-22T10:05:00.000Z"),
		});
		expect(confirmed.status).toBe(OrderStatus.COMPLETED);
		expect(confirmed.confirmationMethod).toBe("SUPPORT");

		const problem = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.READY,
			fulfillmentType: FulfillmentType.PICKUP,
		});
		await setBuyerOrderStatusDB({
			id: problem._id.toString(),
			status: OrderStatus.READY,
			readyAt: new Date("2026-07-22T08:00:00.000Z"),
		});
		await reportPickupNoShow({
			vendorUserId: userId,
			orderId: problem._id.toString(),
			now: new Date("2026-07-22T10:00:00.000Z"),
		});
		const disputed = await respondToPickupNoShow({
			buyerId,
			orderId: problem._id.toString(),
			response: "PROBLEM_REPORTED",
			note: "I collected it but the vendor did not scan my code.",
			now: new Date("2026-07-22T10:07:00.000Z"),
		});
		expect(disputed.status).toBe(OrderStatus.PICKUP_PROBLEM_REPORTED);
		expect(disputed.adminReviewRequiredAt).toBeInstanceOf(Date);
		expect(disputed.pickupProblemNote).toContain("vendor did not scan");
	});

	it("records buyer-unreachable evidence and blocks delivery failed until 15 minutes pass", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const order = await makeOrder({
			vendorId,
			buyerId: buyer!._id.toString(),
			campusId,
			status: OrderStatus.IN_TRANSIT,
			fulfillmentType: FulfillmentType.DELIVERY,
		});
		const reported = await reportBuyerUnreachable({
			vendorUserId: userId,
			orderId: order._id.toString(),
			arrivalTime: new Date("2026-07-22T12:00:00.000Z"),
			contactAttempts: 2,
			note: "Called twice and knocked at the room.",
			photoUrl: "https://example.com/evidence.jpg",
			now: new Date("2026-07-22T12:03:00.000Z"),
		});

		expect(reported.status).toBe(OrderStatus.BUYER_UNREACHABLE_REPORTED);
		expect(reported.deliveryContactAttempts).toBe(2);
		expect(reported.deliveryEvidencePhotoUrl).toBe(
			"https://example.com/evidence.jpg",
		);
		expect(reported.deliveryBuyerResponseDeadline).toEqual(
			new Date("2026-07-22T12:18:00.000Z"),
		);

		await expect(
			markDeliveryFailed({
				vendorUserId: userId,
				orderId: order._id.toString(),
				now: new Date("2026-07-22T12:17:00.000Z"),
			}),
		).rejects.toThrow();

		const failed = await markDeliveryFailed({
			vendorUserId: userId,
			orderId: order._id.toString(),
			now: new Date("2026-07-22T12:18:00.000Z"),
		});
		expect(failed.status).toBe(OrderStatus.DELIVERY_FAILED);
		expect(failed.refundPendingAt).toBeUndefined();
		expect(failed.adminReviewReason).toBe("DELIVERY_FAILED");
		expect(failed.timeline?.map((entry) => entry.type)).toEqual(
			expect.arrayContaining([
				"VENDOR_REPORTED_BUYER_UNREACHABLE",
				"VENDOR_MARKED_DELIVERY_FAILED",
			]),
		);
	});
});

describe("cancelOrderAsBuyer", () => {
	it("cancels a PAID order and releases holds (no payment → no refund)", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.PAID,
		});
		const res = await cancelOrderAsBuyer({
			buyerId,
			orderId: order._id.toString(),
			reason: "changed mind",
		});
		expect(res.message).toMatch(/cancelled/i);
	});

	it("refuses to cancel a non-cancellable order", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.COMPLETED,
		});
		await expect(
			cancelOrderAsBuyer({
				buyerId,
				orderId: order._id.toString(),
				reason: "x",
			}),
		).rejects.toThrow();
	});
});

describe("reviews service", () => {
	it("creates a review for a completed order, then blocks a duplicate", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.COMPLETED,
		});
		const review = await createReview({
			userId: buyerId,
			input: {
				buyerOrderId: order._id.toString(),
				rating: 5,
				comment: "Excellent",
			},
		});
		expect(review!.rating).toBe(5);

		// the vendor rating aggregate is now reflected
		const { aggregate } = await getVendorReviews({ vendorId });
		expect(aggregate.count).toBe(1);
		expect(aggregate.avg).toBe(5);

		const fetched = await getReviewForOrder({
			userId: buyerId,
			buyerOrderId: order._id.toString(),
		});
		expect(fetched!._id.toString()).toBe(review!._id.toString());

		await expect(
			createReview({
				userId: buyerId,
				input: { buyerOrderId: order._id.toString(), rating: 3 },
			}),
		).rejects.toThrow();
	});

	it("rejects reviewing a non-completed order", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.PAID,
		});
		await expect(
			createReview({
				userId: buyerId,
				input: { buyerOrderId: order._id.toString(), rating: 4 },
			}),
		).rejects.toThrow();
	});

	it("lets the vendor report/flag a review on their own profile", async () => {
		const { userId, vendorId, campusId } = await makeVendor();
		const buyer = await makeUser();
		const buyerId = buyer!._id.toString();
		const order = await makeOrder({
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.COMPLETED,
		});
		const review = await createReview({
			userId: buyerId,
			input: { buyerOrderId: order._id.toString(), rating: 1 },
		});
		const res = await reportReview({
			userId,
			reviewId: review!._id.toString(),
		});
		expect(res.isFlagged).toBe(true);
	});
});

describe("siteConfigs update service", () => {
	it("persists a change, invalidates the cache and audits", async () => {
		const updated = await updateSiteConfigs({
			payload: { reviewWindowHours: 48, marketplaceEnabled: false },
			adminId: oid(),
			role: "SUPER_ADMIN",
		});
		expect(updated!.reviewWindowHours).toBe(48);
		expect(updated!.marketplaceEnabled).toBe(false);
	});
});
