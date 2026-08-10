import {
	listInTransitDeliveryOrdersForOverdueDB,
	markDeliveryOverdueEscalatedDB,
} from "@/server/models";
import { notifyDeliveryOverdueEscalated } from "../notifications";
import { openOrderDisputeForReview } from "../orderDisputes";
import { getSiteConfigs } from "../siteConfigs";

export interface DeliveryOverdueSweepResult {
	scanned: number;
	escalated: number;
	failed: number;
}

const ADMIN_REVIEW_REASON = "DELIVERY_CONFIRMATION_OVERDUE";

function positiveMinutes(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.round(value)
		: null;
}

export async function sweepDeliveryOverdueOrders({
	now = new Date(),
	limit = 200,
}: {
	now?: Date;
	limit?: number;
} = {}): Promise<DeliveryOverdueSweepResult> {
	const config = await getSiteConfigs();
	const result: DeliveryOverdueSweepResult = {
		scanned: 0,
		escalated: 0,
		failed: 0,
	};

	if (!config.deliveryOverdueAutoEscalateEnabled) return result;

	const graceMinutes = Math.max(
		0,
		Math.round(config.deliveryInTransitGraceMinutes),
	);
	const fallbackEstimateMinutes = Math.max(
		1,
		Math.round(config.deliveryInTransitFallbackEstimateMinutes),
	);
	const orders = await listInTransitDeliveryOrdersForOverdueDB({ limit });
	result.scanned = orders.length;

	for (const order of orders) {
		if (!order.deliveryStartedAt) continue;
		const estimateMinutes =
			positiveMinutes(order.deliveryEstimateMinutes) ??
			fallbackEstimateMinutes;
		const deadline = new Date(
			new Date(order.deliveryStartedAt).getTime() +
				(estimateMinutes + graceMinutes) * 60 * 1000,
		);
		if (deadline.getTime() > now.getTime()) continue;

		try {
			const marked = await markDeliveryOverdueEscalatedDB({
				id: order._id.toString(),
				now,
				reason: ADMIN_REVIEW_REASON,
				deadline,
				estimateMinutes,
				graceMinutes,
			});
			if (!marked) continue;
			result.escalated += 1;

			await notifyDeliveryOverdueEscalated({
				buyerId: marked.buyerId.toString(),
				orderNumber: marked.orderNumber,
				deadline,
				data: {
					orderId: marked._id.toString(),
					estimateMinutes,
					graceMinutes,
				},
			});

			await openOrderDisputeForReview({
				orderId: marked._id.toString(),
				reason: "NON_DELIVERY",
				buyerNotes: [
					"System escalated this delivery because it stayed in transit past the promised delivery estimate plus grace period.",
				],
				vendorNotes: [
					`Delivery estimate: ${estimateMinutes} minutes. Grace: ${graceMinutes} minutes.`,
				],
			});
		} catch (error) {
			result.failed += 1;
			console.error(
				`[delivery-overdue] escalation failed for order ${order._id}:`,
				error,
			);
		}
	}

	return result;
}
