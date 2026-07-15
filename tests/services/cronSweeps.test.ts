// The idempotent cron sweeps. All three run repeatedly over overlapping windows,
// so the property that matters most is that a claim (Redis SET NX) makes the
// second tick a no-op — a naive version would text the same buyer every minute.
//
// Real Mongo + real Redis locks. The ONLY mock is the Sendchamp SMS boundary
// (money-costing network). Redis lock keys are tracked and deleted in afterAll so
// the run leaves no keys behind.

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
import { DB_NAME } from "@/server/constants";
import { generateShareableToken } from "@/server/constants/orderNumber";
import { Redis } from "@/server/databases";
import {
	createBuyerOrderDB,
	createDailyOrderDB,
	DailyOrderStatus,
	FulfillmentType,
	listNotificationsDB,
	OrderStatus,
	setDailyOrderStatusDB,
} from "@/server/models";
import { sendchampProvider } from "@/server/providers";
import { rebuildDailySnapshots } from "@/server/services/analyticsJobs";
import { sendCutoffWarnings } from "@/server/services/buyerOrders/cutoffWarning";
import { sendDueReviewPrompts } from "@/server/services/notifications/reviewPrompts";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeVendor } from "../helpers/factories";

const redisKeys = new Set<string>();
const HOUR = 60 * 60 * 1000;

beforeAll(async () => {
	await connectTestDB();
});

afterEach(() => {
	vi.restoreAllMocks();
});

afterAll(async () => {
	if (redisKeys.size) await Redis.del(...redisKeys);
	await dropAndDisconnect();
});

async function makeListing(
	vendorId: string,
	campusId: string,
	cutoffInMs: number,
) {
	const listing = await createDailyOrderDB({
		payload: {
			vendorId,
			campusId,
			shareableToken: generateShareableToken(),
			title: "Lunch",
			scheduledDate: new Date(Date.now() + cutoffInMs + HOUR),
			cutoffTime: new Date(Date.now() + cutoffInMs),
			pickupAvailable: true,
			items: [
				{
					menuItemId: oid(),
					snapshotName: "Jollof",
					snapshotPriceKobo: 150000,
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
	return listing!;
}

async function makeOrder(
	vendorId: string,
	campusId: string,
	dailyOrderId: string,
	status: OrderStatus,
	buyerId = oid(),
) {
	const order = await createBuyerOrderDB({
		payload: {
			orderNumber: `PC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
			dailyOrderId,
			vendorId,
			buyerId,
			campusId,
			status,
			fulfillmentType: FulfillmentType.PICKUP,
			subtotalKobo: 150000,
			deliveryFeeKobo: 0,
			platformFeeKobo: 0,
			totalKobo: 150000,
			items: [
				{
					dailyOrderItemId: oid(),
					menuItemId: oid(),
					snapshotName: "Jollof",
					snapshotPriceKobo: 150000,
					quantity: 1,
					subtotalKobo: 150000,
					selectedOptions: [],
				},
			],
		} as never,
	});
	return order!;
}

describe("sendCutoffWarnings", () => {
	it("warns the vendor once and nudges each unpaid buyer, then is idempotent", async () => {
		const smsSpy = vi
			.spyOn(sendchampProvider, "sendCustom")
			.mockResolvedValue(undefined as never);
		const { vendorId, campusId } = await makeVendor();
		const listing = await makeListing(vendorId, campusId, 15 * 60 * 1000);
		const listingId = listing._id.toString();
		redisKeys.add(`cron:warned:${DB_NAME}:cutoff:${listingId}`);

		// Two unpaid buyers (should be nudged) + one already PAID (should not).
		await makeOrder(
			vendorId,
			campusId,
			listingId,
			OrderStatus.PENDING_PAYMENT,
		);
		await makeOrder(
			vendorId,
			campusId,
			listingId,
			OrderStatus.AWAITING_EXTERNAL_PAYMENT,
		);
		await makeOrder(vendorId, campusId, listingId, OrderStatus.PAID);

		const first = await sendCutoffWarnings();
		expect(first.listingsWarned).toBe(1);
		// Only the two unpaid orders.
		expect(first.buyersNotified).toBe(2);

		// The idempotency claim: a second tick inside the window warns nobody.
		const second = await sendCutoffWarnings();
		expect(second.listingsWarned).toBe(0);
		expect(second.buyersNotified).toBe(0);

		// Exactly one vendor SMS across both ticks.
		expect(smsSpy).toHaveBeenCalledTimes(1);
	});

	it("warns nothing when no listing sits inside the window", async () => {
		vi.spyOn(sendchampProvider, "sendCustom").mockResolvedValue(
			undefined as never,
		);
		const { vendorId, campusId } = await makeVendor();
		// Cutoff is 2h away — outside the 30-minute warn window.
		const listing = await makeListing(vendorId, campusId, 2 * HOUR);
		redisKeys.add(
			`cron:warned:${DB_NAME}:cutoff:${listing._id.toString()}`,
		);
		await makeOrder(
			vendorId,
			campusId,
			listing._id.toString(),
			OrderStatus.PENDING_PAYMENT,
		);

		const res = await sendCutoffWarnings();
		expect(res.listingsWarned).toBe(0);
		expect(res.buyersNotified).toBe(0);
	});
});

describe("sendDueReviewPrompts", () => {
	it("prompts a buyer ~25h after completion, exactly once", async () => {
		const { vendorId, campusId } = await makeVendor();
		const buyerId = oid();
		const order = await makeOrder(
			vendorId,
			campusId,
			oid(),
			OrderStatus.COMPLETED,
			buyerId,
		);
		const orderId = order._id.toString();
		redisKeys.add(`cron:prompted:${DB_NAME}:review:${orderId}`);

		// Land updatedAt in the due window (24-30h ago). The review window (72h)
		// is still open, so the prompt is worth sending.
		await mongoose.connection
			.db!.collection("buyerorders")
			.updateOne(
				{ _id: new mongoose.Types.ObjectId(order._id) },
				{ $set: { updatedAt: new Date(Date.now() - 25 * HOUR) } },
			);

		const first = await sendDueReviewPrompts();
		expect(first.scanned).toBeGreaterThanOrEqual(1);
		expect(first.prompted).toBeGreaterThanOrEqual(1);

		// The buyer actually received an in-app REVIEW_PROMPT.
		const list = await listNotificationsDB({ userId: buyerId });
		expect(
			list.some((n: { type: string }) => n.type === "REVIEW_PROMPT"),
		).toBe(true);

		// Idempotency claim: a second sweep over the same window prompts nobody.
		const second = await sendDueReviewPrompts();
		expect(second.prompted).toBe(0);
	});

	it("does not prompt an order that is not COMPLETED", async () => {
		const { vendorId, campusId } = await makeVendor();
		const order = await makeOrder(
			vendorId,
			campusId,
			oid(),
			OrderStatus.PAID,
		);
		await mongoose.connection
			.db!.collection("buyerorders")
			.updateOne(
				{ _id: new mongoose.Types.ObjectId(order._id) },
				{ $set: { updatedAt: new Date(Date.now() - 25 * HOUR) } },
			);
		redisKeys.add(
			`cron:prompted:${DB_NAME}:review:${order._id.toString()}`,
		);

		// It's PAID, not COMPLETED — the status filter excludes it.
		const res = await sendDueReviewPrompts();
		// Whatever else is due, this order is not among the prompted.
		const list = await listNotificationsDB({
			userId: order.buyerId.toString(),
		});
		expect(
			list.some((n: { type: string }) => n.type === "REVIEW_PROMPT"),
		).toBe(false);
		expect(res).toBeDefined();
	});
});

describe("rebuildDailySnapshots", () => {
	it("writes a snapshot for a vendor with activity in the window", async () => {
		const { vendorId, campusId } = await makeVendor();
		// An order created 'now' falls inside the window ending at tomorrow's start.
		await makeOrder(vendorId, campusId, oid(), OrderStatus.COMPLETED);

		// reference = tomorrow ⇒ the "previous day" window is today, catching the
		// order we just created.
		const written = await rebuildDailySnapshots(
			new Date(Date.now() + 24 * HOUR),
		);
		expect(written).toBeGreaterThanOrEqual(1);
	});

	it("writes nothing for a window with no activity", async () => {
		// A window far in the past — no orders were created then.
		const written = await rebuildDailySnapshots(
			new Date("2020-01-02T12:00:00Z"),
		);
		expect(written).toBe(0);
	});
});
