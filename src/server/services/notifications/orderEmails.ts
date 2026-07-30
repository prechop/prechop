import { APP_URL, koboToNaira } from "@/server/constants";
import {
	getUserByIdDB,
	type IBuyerOrder,
	type INotification,
	type IVendorProfile,
	recordNotificationDeliveryAttemptDB,
} from "@/server/models";
import { resendProvider } from "@/server/providers";

function absoluteUrl(path: string): string {
	return new URL(path, APP_URL).toString();
}

function orderItemCount(order: Pick<IBuyerOrder, "items">): number {
	return order.items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

async function recordEmailAttempt(
	notification: INotification | null,
	status: "sent" | "skipped" | "failed",
	message?: string,
) {
	if (!notification?._id) return;
	await recordNotificationDeliveryAttemptDB({
		id: notification._id.toString(),
		channel: "email",
		status,
		message,
	});
}

export async function sendVendorNewPaidOrderEmail({
	notification,
	vendor,
	order,
}: {
	notification: INotification | null;
	vendor: IVendorProfile;
	order: IBuyerOrder;
}) {
	if (!vendor.notifyNewOrders) {
		await recordEmailAttempt(
			notification,
			"skipped",
			"Vendor disabled new order emails.",
		);
		return;
	}
	if (!vendor.email) {
		await recordEmailAttempt(
			notification,
			"skipped",
			"Vendor has no email address.",
		);
		return;
	}

	const sent = await resendProvider.sendTransactionalEmail({
		to: vendor.email,
		subject: `New paid order ${order.orderNumber}`,
		title: "New paid order",
		body: "A buyer has paid. Please accept or reject this order from your vendor dashboard.",
		actionLabel: "Open vendor order",
		actionUrl: absoluteUrl(
			`/dashboard/${order.dailyOrderId.toString()}?order=${order._id.toString()}`,
		),
		rows: [
			["Order reference", order.orderNumber],
			["Item count", orderItemCount(order)],
			["Fulfilment", order.fulfillmentType],
			["Total", `₦${koboToNaira(order.totalKobo).toLocaleString()}`],
			["Buyer note", order.customerMessage],
		],
	});
	await recordEmailAttempt(notification, sent ? "sent" : "skipped");
}

export async function sendBuyerImportantOrderEmail({
	notification,
	buyerId,
	orderNumber,
	subject,
	title,
	body,
	orderId,
}: {
	notification: INotification | null;
	buyerId: string;
	orderNumber: string;
	subject: string;
	title: string;
	body: string;
	orderId?: string;
}) {
	const buyer = await getUserByIdDB({ id: buyerId });
	if (!buyer?.email) {
		await recordEmailAttempt(
			notification,
			"skipped",
			"Buyer has no email address.",
		);
		return;
	}
	const sent = await resendProvider.sendTransactionalEmail({
		to: buyer.email,
		subject,
		title,
		body,
		actionLabel: "Open order",
		actionUrl: absoluteUrl(
			orderId ? `/my-orders/${orderId}` : "/my-orders",
		),
		rows: [["Order reference", orderNumber]],
	});
	await recordEmailAttempt(notification, sent ? "sent" : "skipped");
}

export async function sendVendorImportantOrderEmail({
	notification,
	vendorUserId,
	orderNumber,
	subject,
	title,
	body,
	orderId,
}: {
	notification: INotification | null;
	vendorUserId: string;
	orderNumber: string;
	subject: string;
	title: string;
	body: string;
	orderId?: string;
}) {
	const vendorUser = await getUserByIdDB({ id: vendorUserId });
	if (!vendorUser?.email) {
		await recordEmailAttempt(
			notification,
			"skipped",
			"Vendor user has no email address.",
		);
		return;
	}
	const sent = await resendProvider.sendTransactionalEmail({
		to: vendorUser.email,
		subject,
		title,
		body,
		actionLabel: "Open vendor orders",
		actionUrl: absoluteUrl(
			orderId
				? `/vendor/orders/incoming?order=${orderId}`
				: "/vendor/orders/incoming",
		),
		rows: [["Order reference", orderNumber]],
	});
	await recordEmailAttempt(notification, sent ? "sent" : "skipped");
}
