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
import { type AuthResult, requirePermission } from "@/server/lib/auth";
import {
	createBuyerOrderDB,
	createPaymentDB,
	FulfillmentType,
	getBuyerOrderByIdDB,
	listNotificationsDB,
	OrderStatus,
	PaymentStatus,
} from "@/server/models";
import { paystackProvider } from "@/server/providers";
import {
	listDisputesForOrder,
	permissionForDisputeAction,
	reviewOrderDisputeAsAdmin,
} from "@/server/services/admin/disputes";
import { openOrderDisputeForReview } from "@/server/services/orderDisputes";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeVendor } from "../helpers/factories";

const TOTAL = 120000;
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
	await dropAndDisconnect();
});

function authWith(actions: string[]): AuthResult {
	return {
		userId: oid(),
		token: { userId: oid(), role: "BUYER" } as never,
		refreshed: false,
		campusId: oid(),
		isActive: true,
		groups: [],
		permissions: actions,
		statements: [{ effect: "Allow", actions }],
	};
}

async function paidOrder() {
	const { vendorId, campusId } = await makeVendor();
	const order = await createBuyerOrderDB({
		payload: {
			orderNumber: generateOrderNumber(),
			dailyOrderId: oid(),
			vendorId,
			buyerId: oid(),
			campusId,
			status: OrderStatus.COMPLETED,
			fulfillmentType: FulfillmentType.DELIVERY,
			deliveryAdditionalInfo: "Call at the gate",
			customerMessage: "Not too much pepper",
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
		},
	});
	expect(order).toBeTruthy();
	const orderId = order?._id.toString() ?? "";
	const ref = generatePaystackRef();
	await createPaymentDB({
		payload: {
			buyerOrderId: orderId,
			buyerId: order?.buyerId.toString() ?? "",
			vendorId,
			paystackRef: ref,
			amountKobo: TOTAL,
			platformFeeKobo: 0,
			vendorAmountKobo: TOTAL,
			idempotencyKey: hash(ref),
			status: PaymentStatus.SUCCESS,
		},
	});
	return orderId;
}

async function pickupProblemOrder() {
	const { userId: vendorUserId, vendorId, campusId } = await makeVendor();
	const buyerId = oid();
	const pickupProblemNote =
		"I arrived before the deadline, but the vendor refused to hand over my food.";
	const readyAt = new Date("2026-08-10T05:00:00.000Z");
	const noShowReportedAt = new Date("2026-08-10T07:00:00.000Z");
	const problemReportedAt = new Date("2026-08-10T07:05:00.000Z");
	const order = await createBuyerOrderDB({
		payload: {
			orderNumber: generateOrderNumber(),
			dailyOrderId: oid(),
			vendorId,
			buyerId,
			campusId,
			status: OrderStatus.PICKUP_PROBLEM_REPORTED,
			fulfillmentType: FulfillmentType.PICKUP,
			readyAt,
			pickupNoShowReportedAt: noShowReportedAt,
			pickupProblemReportedAt: problemReportedAt,
			pickupProblemNote,
			adminReviewReason: "PICKUP_PROBLEM_REPORTED",
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
		},
	});
	expect(order).toBeTruthy();
	const orderId = order?._id.toString() ?? "";
	const ref = generatePaystackRef();
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
			status: PaymentStatus.SUCCESS,
		},
	});
	return {
		orderId,
		buyerId,
		vendorUserId,
		pickupProblemNote,
	};
}

describe("order dispute admin review", () => {
	it("stores evidence snapshots and opens each order/reason idempotently", async () => {
		const orderId = await paidOrder();
		const first = await openOrderDisputeForReview({
			orderId,
			reason: "WRONG_ITEM",
			buyerNotes: ["Rice was swapped"],
			photos: ["https://example.com/wrong-item.jpg"],
		});
		const second = await openOrderDisputeForReview({
			orderId,
			reason: "WRONG_ITEM",
			buyerNotes: ["Duplicate submit"],
		});

		expect(second._id.toString()).toBe(first._id.toString());
		expect(first.reason).toBe("WRONG_ITEM");
		expect(first.status).toBe("OPEN");
		expect(first.evidence.orderSnapshot).toBeTruthy();
		expect(first.evidence.menuSnapshot?.items).toHaveLength(1);
		expect(first.evidence.paymentRecord).toBeTruthy();
		expect(first.evidence.messages).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ text: "Not too much pepper" }),
			]),
		);
		expect(first.evidence.photos).toContain(
			"https://example.com/wrong-item.jpg",
		);
	});

	it("records admin review actions and blocks unsafe partial refunds", async () => {
		const orderId = await paidOrder();
		const dispute = await openOrderDisputeForReview({
			orderId,
			reason: "QUALITY_COMPLAINT",
			buyerNotes: ["Food was cold"],
		});

		await expect(
			reviewOrderDisputeAsAdmin({
				disputeId: dispute._id.toString(),
				action: "ISSUE_PARTIAL_REFUND",
				amountKobo: 5000,
				note: "Partial goodwill",
				actor,
			}),
		).rejects.toThrow(/partial refunds are not supported/i);

		const updated = await reviewOrderDisputeAsAdmin({
			disputeId: dispute._id.toString(),
			action: "REQUEST_MORE_EVIDENCE",
			note: "Please upload a clear photo.",
			actor,
		});

		expect(updated.status).toBe("MORE_EVIDENCE_REQUESTED");
		expect(updated.resolutionAction).toBe("REQUEST_MORE_EVIDENCE");
	});

	it("uses refund:create for refund actions and support:update for review actions", () => {
		const support = authWith(["support:update"]);
		const finance = authWith(["refund:create"]);

		expect(permissionForDisputeAction("REQUEST_MORE_EVIDENCE")).toBe(
			"support:update",
		);
		expect(permissionForDisputeAction("ISSUE_FULL_REFUND")).toBe(
			"refund:create",
		);

		expect(() =>
			requirePermission(
				support,
				permissionForDisputeAction("REQUEST_MORE_EVIDENCE"),
			),
		).not.toThrow();
		expect(() =>
			requirePermission(
				support,
				permissionForDisputeAction("ISSUE_FULL_REFUND"),
			),
		).toThrow();
		expect(() =>
			requirePermission(
				finance,
				permissionForDisputeAction("ISSUE_FULL_REFUND"),
			),
		).not.toThrow();
	});

	it("shows the buyer's pickup complaint once in the per-order dispute evidence", async () => {
		const { orderId, pickupProblemNote } = await pickupProblemOrder();
		const dispute = await openOrderDisputeForReview({
			orderId,
			reason: "BUYER_NO_SHOW_COMPLAINT",
			buyerNotes: [pickupProblemNote],
		});

		expect(dispute.evidence.buyerNotes).toEqual([pickupProblemNote]);
		const forOrder = await listDisputesForOrder(orderId);
		expect(forOrder).toHaveLength(1);
		expect(forOrder[0]._id.toString()).toBe(dispute._id.toString());
	});

	it("requires an admin note and keeps an evidence request open", async () => {
		const { orderId } = await pickupProblemOrder();
		const dispute = await openOrderDisputeForReview({
			orderId,
			reason: "BUYER_NO_SHOW_COMPLAINT",
		});

		await expect(
			reviewOrderDisputeAsAdmin({
				disputeId: dispute._id.toString(),
				action: "REQUEST_MORE_EVIDENCE",
				actor,
			}),
		).rejects.toThrow(/admin note/i);

		const updated = await reviewOrderDisputeAsAdmin({
			disputeId: dispute._id.toString(),
			action: "REQUEST_MORE_EVIDENCE",
			note: "Please explain when you arrived at the pickup point.",
			actor,
		});
		expect(updated.status).toBe("MORE_EVIDENCE_REQUESTED");
	});

	it("upholds a pickup no-show, completes the order, and notifies both parties", async () => {
		const { orderId, buyerId, vendorUserId } = await pickupProblemOrder();
		const dispute = await openOrderDisputeForReview({
			orderId,
			reason: "BUYER_NO_SHOW_COMPLAINT",
		});

		const updated = await reviewOrderDisputeAsAdmin({
			disputeId: dispute._id.toString(),
			action: "UPHOLD_COMPLETION",
			note: "The ready and no-show timestamps support the vendor's report.",
			actor,
		});

		expect(updated.status).toBe("RESOLVED");
		expect(updated.resolutionAction).toBe("UPHOLD_COMPLETION");
		expect((await getBuyerOrderByIdDB({ id: orderId }))?.status).toBe(
			OrderStatus.COMPLETED_BUYER_NO_SHOW,
		);
		for (const userId of [buyerId, vendorUserId]) {
			const notifications = await listNotificationsDB({ userId });
			expect(
				notifications.some(
					(notification) =>
						notification.type === "ORDER_DISPUTE_RESOLVED",
				),
			).toBe(true);
		}
	});

	it("can resolve a pickup problem for the buyer with a full refund", async () => {
		const { orderId } = await pickupProblemOrder();
		const dispute = await openOrderDisputeForReview({
			orderId,
			reason: "BUYER_NO_SHOW_COMPLAINT",
		});
		const refundSpy = vi
			.spyOn(paystackProvider, "refund")
			.mockResolvedValue({
				id: 42,
				status: "success",
				amount: TOTAL,
			});

		const updated = await reviewOrderDisputeAsAdmin({
			disputeId: dispute._id.toString(),
			action: "ISSUE_FULL_REFUND",
			note: "The buyer's evidence shows the vendor refused handover.",
			actor,
		});

		expect(updated.status).toBe("RESOLVED");
		expect(updated.resolutionAction).toBe("ISSUE_FULL_REFUND");
		expect(refundSpy).toHaveBeenCalledTimes(1);
		expect((await getBuyerOrderByIdDB({ id: orderId }))?.status).toBe(
			OrderStatus.REFUNDED,
		);
	});
});
