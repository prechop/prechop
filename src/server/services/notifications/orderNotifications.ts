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
