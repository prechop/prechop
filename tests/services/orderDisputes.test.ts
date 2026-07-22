import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
	OrderStatus,
	PaymentStatus,
} from "@/server/models";
import {
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
});
