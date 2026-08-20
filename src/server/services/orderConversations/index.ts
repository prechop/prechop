import {
	ORDER_CHAT_NOT_OPEN,
	ORDER_CHAT_READ_ONLY,
	orderChatAvailability,
} from "@/constants/orderChat";
import {
	AppError,
	ErrForbidden,
	ErrInvalidAction,
	ErrOrderNotFound,
} from "../../constants";
import type { AuthResult } from "../../lib";
import {
	addOrderConversationMessageDB,
	ensureOrderConversationDB,
	getBuyerOrderByIdDB,
	getVendorProfileByIdDB,
	getVendorProfileByUserIdDB,
	type IOrderConversation,
	type IOrderConversationMessage,
	listOrderConversationsForBuyerDB,
	listOrderConversationsForVendorUserDB,
	markOrderConversationReadDB,
	type OrderConversationParticipantRole,
	type OrderConversationSenderRole,
	OrderStatus,
} from "../../models";
import { createUserNotification } from "../notifications";

const READABLE_STATUSES = new Set<OrderStatus>([
	OrderStatus.PAID,
	OrderStatus.AWAITING_VENDOR_ACCEPTANCE,
	OrderStatus.ACCEPTED,
	OrderStatus.CONFIRMED,
	OrderStatus.COOKING,
	OrderStatus.PREPARING,
	OrderStatus.READY,
	OrderStatus.READY_FOR_PICKUP,
	OrderStatus.READY_FOR_DELIVERY,
	OrderStatus.IN_TRANSIT,
	OrderStatus.AWAITING_BUYER_NO_SHOW_RESPONSE,
	OrderStatus.COMPLETED_BUYER_NO_SHOW,
	OrderStatus.PICKUP_PROBLEM_REPORTED,
	OrderStatus.BUYER_UNREACHABLE_REPORTED,
	OrderStatus.DELIVERY_FAILED,
	OrderStatus.PICKED_UP,
	OrderStatus.DELIVERED,
	OrderStatus.COMPLETED,
	OrderStatus.VENDOR_REJECTED,
	OrderStatus.EXPIRED_VENDOR_NO_RESPONSE,
	OrderStatus.REFUND_PENDING,
	OrderStatus.REFUND_PROCESSING,
	OrderStatus.REFUND_FAILED,
	OrderStatus.CANCELLED,
	OrderStatus.REFUNDED,
]);

export interface OrderConversationView {
	id: string;
	orderId: string;
	orderNumber: string;
	orderStatus: OrderStatus;
	buyerId: string;
	vendorId: string;
	vendorUserId: string;
	participantRole: OrderConversationParticipantRole | "admin";
	messages: IOrderConversationMessage[];
	unreadCount: number;
	canSend: boolean;
	closedReason?: string;
	lastMessageAt?: Date;
	lastMessagePreview?: string;
	createdAt: Date;
	updatedAt: Date;
}

function isAdmin(auth: AuthResult) {
	return (
		auth.groups.includes("Administrators") ||
		auth.permissions.includes("*") ||
		auth.permissions.includes("order:read") ||
		auth.permissions.includes("support:read")
	);
}

function normalizeMessage(message: string) {
	return Array.from(message.replace(/\r\n/g, "\n"))
		.filter((char) => {
			const code = char.charCodeAt(0);
			return code === 10 || code === 9 || (code >= 32 && code !== 127);
		})
		.join("")
		.trim();
}

function countUnread(
	conversation: IOrderConversation,
	role: OrderConversationParticipantRole,
) {
	const readAt =
		role === "buyer"
			? conversation.buyerLastReadAt
			: conversation.vendorLastReadAt;
	const threshold = readAt ? new Date(readAt).getTime() : 0;
	const senderRole: OrderConversationSenderRole =
		role === "buyer" ? "BUYER" : "VENDOR";
	return conversation.messages.filter(
		(message) =>
			message.senderRole !== senderRole &&
			new Date(message.createdAt).getTime() > threshold,
	).length;
}

function canSendForOrder(
	order: { status: OrderStatus; updatedAt?: Date },
	now = new Date(),
) {
	return orderChatAvailability({
		status: order.status,
		updatedAt: order.updatedAt,
		now,
	});
}

async function resolveParticipant({
	auth,
	order,
	adminRead = false,
}: {
	auth: AuthResult;
	order: Awaited<ReturnType<typeof getBuyerOrderByIdDB>>;
	adminRead?: boolean;
}): Promise<{
	role: OrderConversationParticipantRole | "admin";
	senderRole?: OrderConversationSenderRole;
	vendorUserId: string;
}> {
	if (!order) throw ErrOrderNotFound;
	const vendor = await getVendorProfileByIdDB({
		id: order.vendorId.toString(),
	});
	const vendorUserId = vendor?.userId?.toString();
	if (!vendorUserId) throw ErrOrderNotFound;
	if (order.buyerId.toString() === auth.userId) {
		return { role: "buyer", senderRole: "BUYER", vendorUserId };
	}
	if (vendorUserId === auth.userId) {
		return { role: "vendor", senderRole: "VENDOR", vendorUserId };
	}
	if (adminRead && isAdmin(auth)) {
		return { role: "admin", senderRole: "ADMIN", vendorUserId };
	}
	throw ErrForbidden;
}

function toView({
	conversation,
	order,
	role,
}: {
	conversation: IOrderConversation;
	order: NonNullable<Awaited<ReturnType<typeof getBuyerOrderByIdDB>>>;
	role: OrderConversationParticipantRole | "admin";
}): OrderConversationView {
	const sendState = canSendForOrder(order);
	return {
		id: conversation.id ?? conversation._id.toString(),
		orderId: order._id.toString(),
		orderNumber: order.orderNumber,
		orderStatus: order.status,
		buyerId: order.buyerId.toString(),
		vendorId: order.vendorId.toString(),
		vendorUserId: conversation.vendorUserId.toString(),
		participantRole: role,
		messages: conversation.messages,
		unreadCount: role === "admin" ? 0 : countUnread(conversation, role),
		canSend: role !== "admin" && sendState.canSend,
		closedReason: sendState.closedReason,
		lastMessageAt: conversation.lastMessageAt,
		lastMessagePreview: conversation.lastMessagePreview,
		createdAt: conversation.createdAt,
		updatedAt: conversation.updatedAt,
	};
}

async function ensureForOrder({
	orderId,
	auth,
	adminRead = false,
}: {
	orderId: string;
	auth: AuthResult;
	adminRead?: boolean;
}) {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (!READABLE_STATUSES.has(order.status)) {
		throw new AppError(
			"Messaging opens after payment.",
			403,
			"MESSAGING_NOT_AVAILABLE",
		);
	}
	const participant = await resolveParticipant({ auth, order, adminRead });
	const conversation = await ensureOrderConversationDB({
		payload: {
			buyerOrderId: order._id.toString(),
			buyerId: order.buyerId.toString(),
			vendorId: order.vendorId.toString(),
			vendorUserId: participant.vendorUserId,
			orderStatus: order.status,
		},
	});
	if (!conversation) throw ErrInvalidAction;
	return { order, conversation, participant };
}

export async function listMyOrderConversations({
	auth,
	limit,
}: {
	auth: AuthResult;
	limit?: number;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId: auth.userId });
	const [buyerConversations, vendorConversations] = await Promise.all([
		listOrderConversationsForBuyerDB({ buyerId: auth.userId, limit }),
		vendor
			? listOrderConversationsForVendorUserDB({
					vendorUserId: auth.userId,
					limit,
				})
			: Promise.resolve([]),
	]);
	const conversations = Array.from(
		new Map(
			[...buyerConversations, ...vendorConversations].map(
				(conversation) => [
					conversation.id ?? conversation._id.toString(),
					conversation,
				],
			),
		).values(),
	)
		.sort(
			(a, b) =>
				new Date(b.lastMessageAt ?? b.updatedAt).getTime() -
				new Date(a.lastMessageAt ?? a.updatedAt).getTime(),
		)
		.slice(0, limit);
	const views: OrderConversationView[] = [];
	for (const conversation of conversations) {
		const order = await getBuyerOrderByIdDB({
			id: conversation.buyerOrderId.toString(),
		});
		if (!order) continue;
		const role =
			order.buyerId.toString() === auth.userId ? "buyer" : "vendor";
		views.push(
			toView({
				conversation,
				order,
				role,
			}),
		);
	}
	return views;
}

export async function readOrderConversation({
	auth,
	orderId,
	adminRead = false,
}: {
	auth: AuthResult;
	orderId: string;
	adminRead?: boolean;
}) {
	const { order, conversation, participant } = await ensureForOrder({
		orderId,
		auth,
		adminRead,
	});
	return toView({ conversation, order, role: participant.role });
}

export async function sendOrderMessage({
	auth,
	orderId,
	message,
	clientMessageId,
}: {
	auth: AuthResult;
	orderId: string;
	message: string;
	clientMessageId?: string;
}) {
	const body = normalizeMessage(message);
	if (body.length < 1 || body.length > 1000) {
		throw new AppError(
			"Message must be between 1 and 1000 characters.",
			400,
			"INVALID_MESSAGE_LENGTH",
		);
	}
	const { order, conversation, participant } = await ensureForOrder({
		orderId,
		auth,
	});
	const sendState = canSendForOrder(order);
	if (!sendState.canSend) {
		throw new AppError(
			sendState.closedReason ?? "This conversation is closed.",
			409,
			sendState.errorCode === ORDER_CHAT_NOT_OPEN
				? ORDER_CHAT_NOT_OPEN
				: ORDER_CHAT_READ_ONLY,
		);
	}
	if (!participant.senderRole || participant.senderRole === "ADMIN") {
		throw ErrForbidden;
	}
	const updated = await addOrderConversationMessageDB({
		buyerOrderId: order._id.toString(),
		senderId: auth.userId,
		senderRole: participant.senderRole,
		body,
		clientMessageId,
		orderStatus: order.status,
	});
	if (!updated) throw ErrInvalidAction;
	const wasDuplicate =
		updated.messages.length === conversation.messages.length;
	const recipientUserId =
		participant.senderRole === "BUYER"
			? participant.vendorUserId
			: order.buyerId.toString();
	if (!wasDuplicate) {
		await createUserNotification({
			userId: recipientUserId,
			title:
				participant.senderRole === "BUYER"
					? "New order message from buyer"
					: "New order message from kitchen",
			body: `Order ${order.orderNumber}: ${body.slice(0, 90)}`,
			type: "ORDER_MESSAGE",
			data: {
				orderId: order._id.toString(),
				orderNumber: order.orderNumber,
				conversationId: updated.id ?? updated._id.toString(),
			},
		});
	}
	return toView({
		conversation: updated,
		order,
		role: participant.role,
	});
}

export async function markOrderMessagesRead({
	auth,
	orderId,
}: {
	auth: AuthResult;
	orderId: string;
}) {
	const { order, participant } = await ensureForOrder({ orderId, auth });
	if (participant.role === "admin") throw ErrForbidden;
	const updated = await markOrderConversationReadDB({
		buyerOrderId: order._id.toString(),
		role: participant.role,
	});
	if (!updated) throw ErrInvalidAction;
	return toView({
		conversation: updated,
		order,
		role: participant.role,
	});
}
