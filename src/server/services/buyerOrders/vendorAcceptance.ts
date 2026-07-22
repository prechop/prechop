import {
	getVendorProfileByIdDB,
	listExpiredVendorAcceptanceOrdersDB,
	listVendorAcceptanceReminderDueDB,
	markVendorAcceptanceReminderSentDB,
	OrderStatus,
	setBuyerOrderStatusDB,
} from "../../models";
import {
	createUserNotification,
	notifyOrderRefundPending,
	notifyVendorAcceptanceReminder,
	notifyVendorOrderExpired,
} from "../notifications";
import { issueRefund } from "../refunds";

export const VENDOR_ACCEPTANCE_DEADLINE_MINUTES = 10;

export interface VendorAcceptanceSweepResult {
	reminders5: number;
	warnings8: number;
	expired: number;
	refunded: number;
	failed: number;
}

const EXPIRED_REASON =
	"The vendor did not respond within 10 minutes, so your refund has started.";

async function vendorUserId(vendorId: string): Promise<string | null> {
	const vendor = await getVendorProfileByIdDB({ id: vendorId });
	return vendor?.userId?.toString() ?? null;
}

async function sendReminder(minutes: 5 | 8, now: Date): Promise<number> {
	const due = await listVendorAcceptanceReminderDueDB({ minutes, now });
	let sent = 0;
	for (const order of due) {
		const claimed = await markVendorAcceptanceReminderSentDB({
			id: order.id,
			minutes,
			now,
		});
		if (!claimed) continue;
		const userId = await vendorUserId(order.vendorId);
		if (!userId) continue;
		await notifyVendorAcceptanceReminder({
			vendorUserId: userId,
			orderNumber: order.orderNumber,
			minutesElapsed: minutes,
			data: { orderId: order.id },
		});
		sent += 1;
	}
	return sent;
}

export async function sweepVendorAcceptanceDeadlines({
	now = new Date(),
	limit = 200,
}: {
	now?: Date;
	limit?: number;
} = {}): Promise<VendorAcceptanceSweepResult> {
	const result: VendorAcceptanceSweepResult = {
		reminders5: 0,
		warnings8: 0,
		expired: 0,
		refunded: 0,
		failed: 0,
	};

	result.reminders5 = await sendReminder(5, now);
	result.warnings8 = await sendReminder(8, now);

	const expired = await listExpiredVendorAcceptanceOrdersDB({ now, limit });
	for (const order of expired) {
		try {
			const markedExpired = await setBuyerOrderStatusDB({
				id: order.id,
				status: OrderStatus.EXPIRED_VENDOR_NO_RESPONSE,
				fromStatuses: [OrderStatus.AWAITING_VENDOR_ACCEPTANCE],
				vendorNoResponseExpiredAt: now,
			});
			if (!markedExpired) continue;
			result.expired += 1;

			await setBuyerOrderStatusDB({
				id: order.id,
				status: OrderStatus.REFUND_PENDING,
				fromStatuses: [OrderStatus.EXPIRED_VENDOR_NO_RESPONSE],
				refundPendingAt: now,
			});

			const refund = await issueRefund({
				orderId: order.id,
				amountKobo: order.totalKobo,
				reason: EXPIRED_REASON,
			});
			if (refund.outcome === "REFUNDED") result.refunded += 1;

			await notifyOrderRefundPending({
				buyerId: order.buyerId,
				orderNumber: order.orderNumber,
				reason: EXPIRED_REASON,
				data: { orderId: order.id },
			});

			const userId = await vendorUserId(order.vendorId);
			if (userId) {
				await notifyVendorOrderExpired({
					vendorUserId: userId,
					orderNumber: order.orderNumber,
					data: { orderId: order.id },
				});
			}
		} catch (error) {
			result.failed += 1;
			console.error(
				`[vendor-acceptance] expiry handling failed for order ${order.id}:`,
				error,
			);
			createUserNotification({
				userId: order.buyerId,
				title: "Refund pending",
				body: EXPIRED_REASON,
				type: "ORDER_REFUND_PENDING",
				data: { orderId: order.id, orderNumber: order.orderNumber },
			});
		}
	}

	return result;
}
