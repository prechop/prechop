import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	ORDER_CHAT_NOT_OPEN,
	ORDER_CHAT_NOT_OPEN_MESSAGE,
	ORDER_CHAT_READ_ONLY,
	ORDER_CHAT_READ_ONLY_MESSAGE,
} from "@/constants/orderChat";
import { generateOrderNumber } from "@/server/constants/orderNumber";
import {
	BuyerOrder,
	createBuyerOrderDB,
	FulfillmentType,
	OrderConversation,
	OrderStatus,
} from "@/server/models";
import {
	markOrderMessagesRead,
	readOrderConversation,
	sendOrderMessage,
} from "@/server/services/orderConversations";
import { connectTestDB, dropAndDisconnect, oid } from "../helpers/db";
import { makeUser, makeVendor } from "../helpers/factories";

beforeAll(async () => {
	await connectTestDB();
});

afterAll(async () => {
	await dropAndDisconnect();
});

function auth(userId: string, overrides: Record<string, unknown> = {}) {
	return {
		userId,
		token: { userId },
		refreshed: false,
		campusId: oid(),
		isActive: true,
		groups: [],
		permissions: [],
		statements: [],
		...overrides,
	} as any;
}

async function makePaidOrder(status: OrderStatus = OrderStatus.ACCEPTED) {
	const vendor = await makeVendor();
	const buyer = await makeUser({ campusId: vendor.campusId });
	if (!buyer) throw new Error("buyer fixture failed");
	const order = await createBuyerOrderDB({
		payload: {
			orderNumber: generateOrderNumber(),
			dailyOrderId: oid(),
			vendorId: vendor.vendorId,
			buyerId: buyer._id.toString(),
			campusId: vendor.campusId,
			status,
			fulfillmentType: FulfillmentType.PICKUP,
			subtotalKobo: 150000,
			deliveryFeeKobo: 0,
			platformFeeKobo: 5000,
			totalKobo: 155000,
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
		},
	});
	if (!order) throw new Error("order fixture failed");
	return {
		order,
		buyerId: buyer._id.toString(),
		vendorUserId: vendor.userId,
	};
}

describe("order conversations service", () => {
	it.each([
		OrderStatus.PAID,
		OrderStatus.AWAITING_VENDOR_ACCEPTANCE,
	])("keeps %s conversations closed until the vendor accepts", async (status) => {
		const { order, buyerId, vendorUserId } = await makePaidOrder(status);

		const buyerView = await readOrderConversation({
			auth: auth(buyerId),
			orderId: order._id.toString(),
		});
		expect(buyerView.canSend).toBe(false);
		expect(buyerView.closedReason).toBe(ORDER_CHAT_NOT_OPEN_MESSAGE);

		await expect(
			sendOrderMessage({
				auth: auth(vendorUserId),
				orderId: order._id.toString(),
				message: "Please confirm pickup time.",
			}),
		).rejects.toMatchObject({ appCode: ORDER_CHAT_NOT_OPEN });
	});

	it.each([
		OrderStatus.ACCEPTED,
		OrderStatus.COOKING,
		OrderStatus.READY,
		OrderStatus.READY_FOR_PICKUP,
		OrderStatus.READY_FOR_DELIVERY,
		OrderStatus.IN_TRANSIT,
	])("allows chat while an accepted order is %s", async (status) => {
		const { order, buyerId } = await makePaidOrder(status);
		const view = await sendOrderMessage({
			auth: auth(buyerId),
			orderId: order._id.toString(),
			message: "Thanks for the update.",
		});
		expect(view.canSend).toBe(true);
		expect(view.messages).toHaveLength(1);
	});

	it("lets the buyer and owning vendor read and send order messages", async () => {
		const { order, buyerId, vendorUserId } = await makePaidOrder();
		const buyerView = await sendOrderMessage({
			auth: auth(buyerId),
			orderId: order._id.toString(),
			message: "Please add extra pepper.",
			clientMessageId: "buyer-1",
		});
		expect(buyerView.messages).toHaveLength(1);
		expect(buyerView.participantRole).toBe("buyer");

		const vendorView = await readOrderConversation({
			auth: auth(vendorUserId),
			orderId: order._id.toString(),
		});
		expect(vendorView.participantRole).toBe("vendor");
		expect(vendorView.unreadCount).toBe(1);

		const reply = await sendOrderMessage({
			auth: auth(vendorUserId),
			orderId: order._id.toString(),
			message: "Done.",
			clientMessageId: "vendor-1",
		});
		expect(reply.messages).toHaveLength(2);
	});

	it("allows authorised admin read-only access", async () => {
		const { order } = await makePaidOrder();
		const view = await readOrderConversation({
			auth: auth(oid(), {
				groups: ["Administrators"],
				permissions: ["support:read"],
			}),
			orderId: order._id.toString(),
			adminRead: true,
		});
		expect(view.participantRole).toBe("admin");
		expect(view.canSend).toBe(false);
	});

	it("rejects unrelated users", async () => {
		const { order } = await makePaidOrder();
		await expect(
			readOrderConversation({
				auth: auth(oid()),
				orderId: order._id.toString(),
			}),
		).rejects.toThrow(/permission/i);
	});

	it("tracks unread counts and mark-read per participant", async () => {
		const { order, buyerId, vendorUserId } = await makePaidOrder();
		await sendOrderMessage({
			auth: auth(buyerId),
			orderId: order._id.toString(),
			message: "Are you still on schedule?",
		});
		expect(
			(
				await readOrderConversation({
					auth: auth(vendorUserId),
					orderId: order._id.toString(),
				})
			).unreadCount,
		).toBe(1);
		expect(
			(
				await markOrderMessagesRead({
					auth: auth(vendorUserId),
					orderId: order._id.toString(),
				})
			).unreadCount,
		).toBe(0);
	});

	it("deduplicates repeated client message ids", async () => {
		const { order, buyerId } = await makePaidOrder();
		await sendOrderMessage({
			auth: auth(buyerId),
			orderId: order._id.toString(),
			message: "Same retry.",
			clientMessageId: "retry-1",
		});
		await sendOrderMessage({
			auth: auth(buyerId),
			orderId: order._id.toString(),
			message: "Same retry.",
			clientMessageId: "retry-1",
		});
		const stored = await OrderConversation.findOne({
			buyerOrderId: order._id,
		}).lean();
		expect(stored?.messages).toHaveLength(1);
	});

	it("keeps completed history visible but closes old completed orders", async () => {
		const { order, buyerId } = await makePaidOrder(OrderStatus.COMPLETED);
		await BuyerOrder.updateOne(
			{ _id: order._id },
			{ $set: { updatedAt: new Date(Date.now() - 72 * 60 * 60 * 1000) } },
		);
		const view = await readOrderConversation({
			auth: auth(buyerId),
			orderId: order._id.toString(),
		});
		expect(view.canSend).toBe(false);
		expect(view.closedReason).toBe(ORDER_CHAT_READ_ONLY_MESSAGE);
		await expect(
			sendOrderMessage({
				auth: auth(buyerId),
				orderId: order._id.toString(),
				message: "Still need help.",
			}),
		).rejects.toMatchObject({ appCode: ORDER_CHAT_READ_ONLY });
	});

	it("allows completed follow-up inside the support window", async () => {
		const { order, buyerId } = await makePaidOrder(OrderStatus.COMPLETED);
		const view = await sendOrderMessage({
			auth: auth(buyerId),
			orderId: order._id.toString(),
			message: "One last receipt question.",
		});
		expect(view.canSend).toBe(true);
		expect(view.messages).toHaveLength(1);
	});

	it("keeps cancelled history visible but closes old cancelled orders", async () => {
		const { order, buyerId } = await makePaidOrder(OrderStatus.CANCELLED);
		await BuyerOrder.updateOne(
			{ _id: order._id },
			{ $set: { updatedAt: new Date(Date.now() - 72 * 60 * 60 * 1000) } },
		);
		const view = await readOrderConversation({
			auth: auth(buyerId),
			orderId: order._id.toString(),
		});
		expect(view.canSend).toBe(false);
		expect(view.closedReason).toBe(ORDER_CHAT_READ_ONLY_MESSAGE);
		await expect(
			sendOrderMessage({
				auth: auth(buyerId),
				orderId: order._id.toString(),
				message: "Can we follow up?",
			}),
		).rejects.toMatchObject({ appCode: ORDER_CHAT_READ_ONLY });
	});

	it.each([
		OrderStatus.VENDOR_REJECTED,
		OrderStatus.CANCELLED,
	])("allows short follow-up after %s", async (status) => {
		const { order, buyerId, vendorUserId } = await makePaidOrder(status);
		const buyerView = await sendOrderMessage({
			auth: auth(buyerId),
			orderId: order._id.toString(),
			message: "I need help with this order.",
		});
		expect(buyerView.canSend).toBe(true);
		const vendorView = await readOrderConversation({
			auth: auth(vendorUserId),
			orderId: order._id.toString(),
		});
		expect(vendorView.unreadCount).toBe(1);
	});
});
