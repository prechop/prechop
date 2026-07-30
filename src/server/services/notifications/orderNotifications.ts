import { tryDecrypt } from "../../constants";
import { getUserByIdWithPhoneDB } from "../../models";
import { sendchampProvider } from "../../providers";
import { createUserNotification } from "./createUserNotification";
import {
	sendBuyerImportantOrderEmail,
	sendVendorImportantOrderEmail,
} from "./orderEmails";

/**
 * Resolve a user's mobile number for SMS. Phones are stored AES-encrypted;
 * `tryDecrypt` returns "" for a missing value so callers degrade to in-app only
 * rather than texting ciphertext at a phone number that doesn't exist.
 */
async function phoneOf(userId: string): Promise<string> {
	const user = await getUserByIdWithPhoneDB({ id: userId });
	return user?.phone ? tryDecrypt(user.phone) : "";
}

/**
 * Send an SMS without ever letting delivery failure reach the caller.
 *
 * These are triggered from payment webhooks and order-status transitions: the
 * order is already confirmed/ready and the money already moved. A Sendchamp
 * outage must not roll that back or 500 a webhook Paystack will then retry —
 * the in-app notification has already landed and is the durable record.
 */
async function trySms(
	userId: string,
	send: (phone: string) => Promise<void>,
	label: string,
): Promise<void> {
	try {
		const phone = await phoneOf(userId);
		if (!phone) return;
		await send(phone);
	} catch (error) {
		console.error(`[notifications] ${label} SMS failed:`, error);
	}
}

/**
 * Order confirmed — in-app **and** SMS (PRD marks this SMS).
 *
 * SMS matters here specifically because the buyer has just parted with money
 * and may have closed the tab; an in-app-only confirmation is invisible to
 * someone who isn't looking at the app.
 */
export async function notifyOrderConfirmed({
	buyerId,
	orderNumber,
	vendorName,
	data,
}: {
	buyerId: string;
	orderNumber: string;
	vendorName: string;
	data?: Record<string, unknown>;
}): Promise<void> {
	const result = await createUserNotification({
		userId: buyerId,
		title: "Order confirmed",
		body: `Your order ${orderNumber} from ${vendorName} is confirmed. We'll let you know when it's ready.`,
		type: "ORDER_CONFIRMED",
		dedupeKey: `order:${orderNumber}:buyer:confirmed`,
		data: { orderNumber, ...(data ?? {}) },
	});
	if (!result.created) return;
	// Fire-and-forget: the in-app notification is the source of truth.
	void trySms(
		buyerId,
		(phone) =>
			sendchampProvider.sendOrderConfirmation(
				phone,
				orderNumber,
				vendorName,
			),
		"order-confirmed",
	);
}

/**
 * Order ready for collection — in-app **and** SMS (PRD marks this SMS).
 *
 * The highest-value text in the product: the buyer is not in the app, the food
 * is going cold, and the vendor needs them to walk over now.
 */
export async function notifyOrderReady({
	buyerId,
	orderNumber,
	vendorName,
	data,
}: {
	buyerId: string;
	orderNumber: string;
	vendorName?: string | null;
	data?: Record<string, unknown>;
}): Promise<void> {
	const result = await createUserNotification({
		userId: buyerId,
		title: "Your order is ready",
		body: vendorName
			? `Order ${orderNumber} is ready for collection at ${vendorName}.`
			: `Order ${orderNumber} is ready for collection.`,
		type: "ORDER_READY",
		dedupeKey: `order:${orderNumber}:buyer:ready`,
		data: { orderNumber, ...(data ?? {}) },
	});
	if (!result.created) return;
	void sendBuyerImportantOrderEmail({
		notification: result.notification,
		buyerId,
		orderNumber,
		subject: `Order ${orderNumber} is ready`,
		title: "Your order is ready",
		body: vendorName
			? `Your order from ${vendorName} is ready.`
			: "Your order is ready.",
		orderId: data?.orderId as string | undefined,
	}).catch((error) =>
		console.error(`[notifications] order-ready email failed:`, error),
	);
	void trySms(
		buyerId,
		(phone) => sendchampProvider.sendOrderReady(phone, orderNumber),
		"order-ready",
	);
}

export async function notifyOrderInTransit({
	buyerId,
	orderNumber,
	data,
}: {
	buyerId: string;
	orderNumber: string;
	data?: Record<string, unknown>;
}): Promise<void> {
	const result = await createUserNotification({
		userId: buyerId,
		title: "Order In transit",
		body: "Your order is In transit.",
		type: "ORDER_IN_TRANSIT",
		dedupeKey: `order:${orderNumber}:buyer:in-transit`,
		data: { orderNumber, ...(data ?? {}) },
	});
	if (!result.created) return;
	void trySms(
		buyerId,
		(phone) =>
			sendchampProvider.sendCustom(
				phone,
				`PreChop: Your order ${orderNumber} is In transit.`,
			),
		"order-in-transit",
	);
}

export async function notifyOrderAccepted({
	buyerId,
	orderNumber,
	vendorName,
	data,
}: {
	buyerId: string;
	orderNumber: string;
	vendorName: string;
	data?: Record<string, unknown>;
}): Promise<void> {
	const result = await createUserNotification({
		userId: buyerId,
		title: "Order accepted",
		body: `${vendorName} accepted your order and started cooking.`,
		type: "ORDER_ACCEPTED",
		dedupeKey: `order:${orderNumber}:buyer:accepted`,
		data: { orderNumber, ...(data ?? {}) },
	});
	if (!result.created) return;
}

export async function notifyOrderRunningLate({
	buyerId,
	orderNumber,
	vendorName,
	expectedReadyAt,
	data,
}: {
	buyerId: string;
	orderNumber: string;
	vendorName: string;
	expectedReadyAt?: Date;
	data?: Record<string, unknown>;
}): Promise<void> {
	const result = await createUserNotification({
		userId: buyerId,
		title: "Order running late",
		body: `${vendorName} is running late on order ${orderNumber}. You can wait, contact support, or cancel for a refund from your order page.`,
		type: "ORDER_RUNNING_LATE",
		dedupeKey: `order:${orderNumber}:buyer:running-late`,
		data: {
			orderNumber,
			...(expectedReadyAt
				? { expectedReadyAt: expectedReadyAt.toISOString() }
				: {}),
			...(data ?? {}),
		},
	});
	if (!result.created) return;
	void sendBuyerImportantOrderEmail({
		notification: result.notification,
		buyerId,
		orderNumber,
		subject: `Order ${orderNumber} is running late`,
		title: "Order running late",
		body: `${vendorName} is running late on your order. You can wait, contact support, or cancel for a refund from your order page.`,
		orderId: data?.orderId as string | undefined,
	}).catch((error) =>
		console.error(
			`[notifications] order-running-late email failed:`,
			error,
		),
	);
}

export async function notifyVendorOrderRunningLate({
	vendorUserId,
	orderNumber,
	maxExtensions,
	data,
}: {
	vendorUserId: string;
	orderNumber: string;
	maxExtensions: number;
	data?: Record<string, unknown>;
}): Promise<void> {
	const result = await createUserNotification({
		userId: vendorUserId,
		title: "Order deadline missed",
		body: `Order ${orderNumber} is late. Send a revised ready time now. You can revise up to ${maxExtensions} times before admin review.`,
		type: "ORDER_RUNNING_LATE_VENDOR",
		dedupeKey: `order:${orderNumber}:vendor:running-late`,
		data: { orderNumber, ...(data ?? {}) },
	});
	if (!result.created) return;
	void sendVendorImportantOrderEmail({
		notification: result.notification,
		vendorUserId,
		orderNumber,
		subject: `Order ${orderNumber} deadline missed`,
		title: "Order deadline missed",
		body: `Order ${orderNumber} is late. Send a revised ready time now.`,
		orderId: data?.orderId as string | undefined,
	}).catch((error) =>
		console.error(
			`[notifications] vendor-running-late email failed:`,
			error,
		),
	);
}

export async function notifyOrderReadyEstimateRevised({
	buyerId,
	orderNumber,
	vendorName,
	revisedReadyAt,
	data,
}: {
	buyerId: string;
	orderNumber: string;
	vendorName: string;
	revisedReadyAt: Date;
	data?: Record<string, unknown>;
}): Promise<void> {
	const result = await createUserNotification({
		userId: buyerId,
		title: "Ready time updated",
		body: `${vendorName} updated order ${orderNumber}. New estimated ready time: ${revisedReadyAt.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}.`,
		type: "ORDER_READY_ESTIMATE_REVISED",
		dedupeKey: `order:${orderNumber}:buyer:ready-estimate-${revisedReadyAt.getTime()}`,
		data: {
			orderNumber,
			revisedReadyAt: revisedReadyAt.toISOString(),
			...(data ?? {}),
		},
	});
	if (!result.created) return;
}

export async function notifyOrderLateEscalated({
	buyerId,
	orderNumber,
	data,
}: {
	buyerId: string;
	orderNumber: string;
	data?: Record<string, unknown>;
}): Promise<void> {
	const result = await createUserNotification({
		userId: buyerId,
		title: "Support is reviewing your order",
		body: `Order ${orderNumber} is significantly delayed. Support has been alerted, and you can cancel for a refund from the order page.`,
		type: "ORDER_LATE_ESCALATED",
		dedupeKey: `order:${orderNumber}:buyer:late-escalated`,
		data: { orderNumber, ...(data ?? {}) },
	});
	if (!result.created) return;
	void sendBuyerImportantOrderEmail({
		notification: result.notification,
		buyerId,
		orderNumber,
		subject: `Support is reviewing order ${orderNumber}`,
		title: "Support is reviewing your order",
		body: `Order ${orderNumber} is significantly delayed. Support has been alerted.`,
		orderId: data?.orderId as string | undefined,
	}).catch((error) =>
		console.error(`[notifications] late-escalated email failed:`, error),
	);
}

export async function notifyOrderRefundPending({
	buyerId,
	orderNumber,
	reason,
	data,
}: {
	buyerId: string;
	orderNumber: string;
	reason: string;
	data?: Record<string, unknown>;
}): Promise<void> {
	const result = await createUserNotification({
		userId: buyerId,
		title: "Refund started",
		body: `Order ${orderNumber} could not be fulfilled. ${reason}`,
		type: "ORDER_REFUND_PENDING",
		dedupeKey: `order:${orderNumber}:buyer:refund-pending`,
		data: { orderNumber, ...(data ?? {}) },
	});
	if (!result.created) return;
	void sendBuyerImportantOrderEmail({
		notification: result.notification,
		buyerId,
		orderNumber,
		subject: `Refund started for order ${orderNumber}`,
		title: "Refund started",
		body: `Order ${orderNumber} could not be fulfilled. ${reason}`,
		orderId: data?.orderId as string | undefined,
	}).catch((error) =>
		console.error(`[notifications] refund-pending email failed:`, error),
	);
}

export async function notifyVendorAcceptanceReminder({
	vendorUserId,
	orderNumber,
	minutesElapsed,
	data,
}: {
	vendorUserId: string;
	orderNumber: string;
	minutesElapsed: 5 | 8;
	data?: Record<string, unknown>;
}): Promise<void> {
	const result = await createUserNotification({
		userId: vendorUserId,
		title:
			minutesElapsed === 5
				? "Order waiting"
				: "Final warning: order waiting",
		body:
			minutesElapsed === 5
				? `Order ${orderNumber} is still waiting for acceptance.`
				: `Order ${orderNumber} will expire soon if you do not accept or reject it.`,
		type:
			minutesElapsed === 5
				? "ORDER_ACCEPTANCE_REMINDER"
				: "ORDER_ACCEPTANCE_FINAL_WARNING",
		dedupeKey: `order:${orderNumber}:vendor:acceptance-${minutesElapsed}`,
		data: { orderNumber, ...(data ?? {}) },
	});
	if (!result.created) return;
}

export async function notifyVendorOrderExpired({
	vendorUserId,
	orderNumber,
	data,
}: {
	vendorUserId: string;
	orderNumber: string;
	data?: Record<string, unknown>;
}): Promise<void> {
	const result = await createUserNotification({
		userId: vendorUserId,
		title: "Order expired",
		body: `Order ${orderNumber} expired because it was not accepted in time.`,
		type: "ORDER_VENDOR_NO_RESPONSE",
		dedupeKey: `order:${orderNumber}:vendor:expired-no-response`,
		data: { orderNumber, ...(data ?? {}) },
	});
	if (!result.created) return;
	void sendVendorImportantOrderEmail({
		notification: result.notification,
		vendorUserId,
		orderNumber,
		subject: `Order ${orderNumber} expired`,
		title: "Order expired",
		body: `Order ${orderNumber} expired because it was not accepted in time.`,
		orderId: data?.orderId as string | undefined,
	}).catch((error) =>
		console.error(`[notifications] vendor-expired email failed:`, error),
	);
}

export async function notifyPickupNoShowReminder({
	buyerId,
	orderNumber,
	minutesElapsed,
	data,
}: {
	buyerId: string;
	orderNumber: string;
	minutesElapsed: 60 | 90;
	data?: Record<string, unknown>;
}): Promise<void> {
	await createUserNotification({
		userId: buyerId,
		title:
			minutesElapsed === 60 ? "Pickup reminder" : "Final pickup warning",
		body:
			minutesElapsed === 60
				? `Order ${orderNumber} has been ready for pickup for 60 minutes. Please collect it soon.`
				: `Order ${orderNumber} has been ready for pickup for 90 minutes. The vendor may report it uncollected after 120 minutes.`,
		type:
			minutesElapsed === 60 ? "PICKUP_REMINDER_60" : "PICKUP_WARNING_90",
		dedupeKey: `order:${orderNumber}:buyer:pickup-${minutesElapsed}`,
		data: { orderNumber, ...(data ?? {}) },
	});
}

export async function notifyPickupNoShowResponseRequired({
	buyerId,
	orderNumber,
	responseDeadline,
	data,
}: {
	buyerId: string;
	orderNumber: string;
	responseDeadline: Date;
	data?: Record<string, unknown>;
}): Promise<void> {
	await createUserNotification({
		userId: buyerId,
		title: "Pickup response needed",
		body: `The vendor reported order ${orderNumber} was not collected. Please confirm collection or report a problem within 15 minutes.`,
		type: "PICKUP_NO_SHOW_RESPONSE_REQUIRED",
		dedupeKey: `order:${orderNumber}:buyer:pickup-no-show-response`,
		data: {
			orderNumber,
			responseDeadline: responseDeadline.toISOString(),
			...(data ?? {}),
		},
	});
}

export async function notifyBuyerUnreachableUrgent({
	buyerId,
	orderNumber,
	responseDeadline,
	data,
}: {
	buyerId: string;
	orderNumber: string;
	responseDeadline: Date;
	data?: Record<string, unknown>;
}): Promise<void> {
	await createUserNotification({
		userId: buyerId,
		title: "Urgent: delivery contact needed",
		body: `The vendor cannot reach you for order ${orderNumber}. Please contact them immediately. They can mark delivery failed after 15 minutes.`,
		type: "DELIVERY_BUYER_UNREACHABLE",
		dedupeKey: `order:${orderNumber}:buyer:delivery-unreachable`,
		data: {
			orderNumber,
			responseDeadline: responseDeadline.toISOString(),
			...(data ?? {}),
		},
	});
}
