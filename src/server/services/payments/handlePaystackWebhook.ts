import {
	ErrInvalidWebhookSignature,
	ErrPaymentAmountMismatch,
	ErrPaymentVerification,
	koboToNaira,
	tryDecrypt,
} from "../../constants";
import {
	claimPaymentWebhookDB,
	getBuyerOrderByIdDB,
	getPaymentByRefDB,
	getUserByIdWithPhoneDB,
	getVendorProfileByIdDB,
	incrementDailyOrderItemQuantityDB,
	incrementDailyOrderTotalCountDB,
	incrementVendorOrderCountDB,
	markBuyerOrderPaidDB,
} from "../../models";
import { sendchampProvider } from "../../providers";
import { commitSlots } from "../buyerOrders/slots";
import { createUserNotification } from "../notifications";

interface PaystackChargeEvent {
	event: string;
	data: {
		reference: string;
		amount: number;
		channel: string;
		status: string;
	};
}

export async function handlePaystackWebhook({
	rawBody,
	signature,
}: {
	rawBody: string;
	signature: string | undefined;
}): Promise<{ received: boolean; orderNumber?: string }> {
	// 1. Verify signature before touching anything.
	const { paystackProvider } = await import("../../providers");
	if (!paystackProvider.verifyWebhookSignature(rawBody, signature)) {
		throw ErrInvalidWebhookSignature;
	}

	const event = JSON.parse(rawBody) as PaystackChargeEvent;
	if (event.event !== "charge.success") return { received: true };

	const { reference, amount, channel, status } = event.data;
	if (status !== "success") return { received: true };

	// 2. Look up the payment.
	const payment = await getPaymentByRefDB({ paystackRef: reference });
	if (!payment) throw ErrPaymentVerification;

	// 3. Idempotency: already processed → no-op (200).
	if (payment.webhookVerified) return { received: true };

	// 4. Amount must match the order total exactly.
	if (amount !== payment.amountKobo) throw ErrPaymentAmountMismatch;

	// 5. Atomically claim (first webhook wins; concurrent duplicate → no-op).
	const claimed = await claimPaymentWebhookDB({
		paystackRef: reference,
		channel,
	});
	if (!claimed) return { received: true };

	// 6. Transition the order to PAID.
	const order = await getBuyerOrderByIdDB({ id: payment.buyerOrderId });
	if (!order) throw ErrPaymentVerification;
	await markBuyerOrderPaidDB({ id: order._id.toString(), channel });

	// 7. Commit capacity: bump listing ordered quantities + counts.
	await Promise.allSettled(
		order.items.map((item) =>
			incrementDailyOrderItemQuantityDB({
				dailyOrderId: order.dailyOrderId.toString(),
				dailyOrderItemId: item.dailyOrderItemId.toString(),
				by: item.quantity,
			}),
		),
	);
	await incrementDailyOrderTotalCountDB({
		dailyOrderId: order.dailyOrderId.toString(),
	});
	await incrementVendorOrderCountDB({ id: order.vendorId.toString() });
	await commitSlots(
		order.items.map((i) => ({
			dailyOrderItemId: i.dailyOrderItemId.toString(),
			quantity: i.quantity,
		})),
	);

	// 8. Notify vendor + buyer (fire-and-forget).
	void notifyParties(order);

	return { received: true, orderNumber: order.orderNumber };
}

async function notifyParties(order: {
	orderNumber: string;
	vendorId: string;
	buyerId: string;
	totalKobo: number;
}): Promise<void> {
	try {
		const vendor = await getVendorProfileByIdDB({
			id: order.vendorId.toString(),
		});
		if (vendor?.userId) {
			createUserNotification({
				userId: vendor.userId.toString(),
				title: "New paid order",
				body: `Order ${order.orderNumber} • ₦${koboToNaira(order.totalKobo).toLocaleString()}`,
				type: "ORDER_PAID",
				data: { orderNumber: order.orderNumber },
			});
			const vendorUser = await getUserByIdWithPhoneDB({
				id: vendor.userId.toString(),
			});
			const phone = vendorUser?.phone ? tryDecrypt(vendorUser.phone) : "";
			if (phone) {
				sendchampProvider
					.sendVendorNewOrder(
						phone,
						order.orderNumber,
						koboToNaira(order.totalKobo),
					)
					.catch(() => {});
			}
		}
		createUserNotification({
			userId: order.buyerId.toString(),
			title: "Payment confirmed",
			body: `Your order ${order.orderNumber} is confirmed.`,
			type: "ORDER_CONFIRMED",
			data: { orderNumber: order.orderNumber },
		});
	} catch (error) {
		console.error("[webhook] notify parties failed:", error);
	}
}
