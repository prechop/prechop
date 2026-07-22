import { tryDecrypt } from "../../constants";
import { getUserByIdWithPhoneDB } from "../../models";
import { sendchampProvider } from "../../providers";
import { createUserNotification } from "./createUserNotification";

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
	await createUserNotification({
		userId: buyerId,
		title: "Order confirmed",
		body: `Your order ${orderNumber} from ${vendorName} is confirmed. We'll let you know when it's ready.`,
		type: "ORDER_CONFIRMED",
		data: { orderNumber, ...(data ?? {}) },
	});
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
	await createUserNotification({
		userId: buyerId,
		title: "Your order is ready",
		body: vendorName
			? `Order ${orderNumber} is ready for collection at ${vendorName}.`
			: `Order ${orderNumber} is ready for collection.`,
		type: "ORDER_READY",
		data: { orderNumber, ...(data ?? {}) },
	});
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
	await createUserNotification({
		userId: buyerId,
		title: "Order on the way",
		body: "Your order is on the way.",
		type: "ORDER_IN_TRANSIT",
		data: { orderNumber, ...(data ?? {}) },
	});
	void trySms(
		buyerId,
		(phone) =>
			sendchampProvider.sendCustom(
				phone,
				`PreChop: Your order ${orderNumber} is on the way.`,
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
	await createUserNotification({
		userId: buyerId,
		title: "Order accepted",
		body: `${vendorName} accepted your order and started cooking.`,
		type: "ORDER_ACCEPTED",
		data: { orderNumber, ...(data ?? {}) },
	});
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
	await createUserNotification({
		userId: buyerId,
		title: "Refund started",
		body: `Order ${orderNumber} could not be fulfilled. ${reason}`,
		type: "ORDER_REFUND_PENDING",
		data: { orderNumber, ...(data ?? {}) },
	});
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
	await createUserNotification({
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
		data: { orderNumber, ...(data ?? {}) },
	});
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
	await createUserNotification({
		userId: vendorUserId,
		title: "Order expired",
		body: `Order ${orderNumber} expired because it was not accepted in time.`,
		type: "ORDER_VENDOR_NO_RESPONSE",
		data: { orderNumber, ...(data ?? {}) },
	});
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
		data: {
			orderNumber,
			responseDeadline: responseDeadline.toISOString(),
			...(data ?? {}),
		},
	});
}
