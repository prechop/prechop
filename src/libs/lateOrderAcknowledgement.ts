export type LateOrderAckRole = "buyer" | "vendor";

export const lateOrderAckKey = (role: LateOrderAckRole, orderId: string) =>
	`prechop:${role}:late-order-ack:${orderId}`;

export function hasLateOrderAck(role: LateOrderAckRole, orderId: string) {
	if (typeof window === "undefined") return true;
	return window.localStorage.getItem(lateOrderAckKey(role, orderId)) === "1";
}

export function rememberLateOrderAck(role: LateOrderAckRole, orderId: string) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(lateOrderAckKey(role, orderId), "1");
}
