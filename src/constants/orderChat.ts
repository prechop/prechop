import type { OrderStatus } from "@/types";

type OrderChatStatus = OrderStatus | string;

export const ORDER_CHAT_NOT_OPEN = "ORDER_CHAT_NOT_OPEN";
export const ORDER_CHAT_READ_ONLY = "ORDER_CHAT_READ_ONLY";

export const ORDER_CHAT_NOT_OPEN_MESSAGE =
	"Chat becomes available after the kitchen accepts your order.";
export const ORDER_CHAT_READ_ONLY_MESSAGE =
	"This order conversation is read-only. Open support if you still need help.";

export const ORDER_CHAT_SUPPORT_WINDOW_MS = 48 * 60 * 60 * 1000;

const UNPAID_STATUSES = new Set<string>([
	"PENDING_PAYMENT",
	"AWAITING_EXTERNAL_PAYMENT",
]);

const PRE_ACCEPTANCE_STATUSES = new Set<string>([
	"PAID",
	"AWAITING_VENDOR_ACCEPTANCE",
]);

const ACTIVE_CHAT_STATUSES = new Set<string>([
	"ACCEPTED",
	"CONFIRMED",
	"COOKING",
	"PREPARING",
	"READY",
	"READY_FOR_PICKUP",
	"READY_FOR_DELIVERY",
	"IN_TRANSIT",
	"AWAITING_BUYER_NO_SHOW_RESPONSE",
	"PICKUP_PROBLEM_REPORTED",
	"BUYER_UNREACHABLE_REPORTED",
	"REFUND_PENDING",
	"REFUND_PROCESSING",
	"REFUND_FAILED",
]);

const SUPPORT_WINDOW_STATUSES = new Set<string>([
	"COMPLETED_BUYER_NO_SHOW",
	"DELIVERY_FAILED",
	"PICKED_UP",
	"DELIVERED",
	"COMPLETED",
	"VENDOR_REJECTED",
	"EXPIRED_VENDOR_NO_RESPONSE",
	"CANCELLED",
	"REFUNDED",
]);

export function shouldShowOrderChatEntry(status: OrderChatStatus) {
	return !UNPAID_STATUSES.has(status) && !PRE_ACCEPTANCE_STATUSES.has(status);
}

export function canSendOrderChat({
	status,
	updatedAt,
	now = new Date(),
}: {
	status: OrderChatStatus;
	updatedAt?: Date | string | number | null;
	now?: Date;
}) {
	if (ACTIVE_CHAT_STATUSES.has(status)) return true;
	if (!SUPPORT_WINDOW_STATUSES.has(status)) return false;
	const updatedAtMs = updatedAt ? new Date(updatedAt).getTime() : 0;
	return (
		Number.isFinite(updatedAtMs) &&
		updatedAtMs > 0 &&
		now.getTime() - updatedAtMs <= ORDER_CHAT_SUPPORT_WINDOW_MS
	);
}

export function orderChatAvailability({
	status,
	updatedAt,
	now = new Date(),
}: {
	status: OrderChatStatus;
	updatedAt?: Date | string | number | null;
	now?: Date;
}) {
	if (UNPAID_STATUSES.has(status)) {
		return {
			canSend: false,
			readOnly: true,
			closedReason: "Messaging opens after payment.",
			errorCode: ORDER_CHAT_NOT_OPEN,
		};
	}
	if (PRE_ACCEPTANCE_STATUSES.has(status)) {
		return {
			canSend: false,
			readOnly: true,
			closedReason: ORDER_CHAT_NOT_OPEN_MESSAGE,
			errorCode: ORDER_CHAT_NOT_OPEN,
		};
	}
	if (canSendOrderChat({ status, updatedAt, now })) {
		return {
			canSend: true,
			readOnly: false,
			closedReason: undefined,
			errorCode: undefined,
		};
	}
	return {
		canSend: false,
		readOnly: true,
		closedReason: ORDER_CHAT_READ_ONLY_MESSAGE,
		errorCode: ORDER_CHAT_READ_ONLY,
	};
}
