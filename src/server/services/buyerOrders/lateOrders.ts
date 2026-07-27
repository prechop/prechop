import {
	ErrForbidden,
	ErrOrderNotFound,
	invalidOrderState,
	validationError,
} from "../../constants";
import {
	getBuyerOrderByIdDB,
	getVendorProfileByIdDB,
	getVendorProfileByUserIdDB,
	listLateOrdersForEscalationDB,
	listReadyDeadlineDueOrdersDB,
	markBuyerOrderLateDB,
	markBuyerOrderLateEscalatedDB,
	reviseBuyerOrderReadyEstimateDB,
} from "../../models";
import {
	notifyAdminAttention,
	notifyOrderLateEscalated,
	notifyOrderReadyEstimateRevised,
	notifyOrderRunningLate,
	notifyVendorOrderRunningLate,
} from "../notifications";

export const MAX_READY_EXTENSIONS = 2;
const SIGNIFICANT_LATE_DELAY_MS = 30 * 60 * 1000;

export async function sweepLateBuyerOrders(now = new Date()): Promise<{
	lateMarked: number;
	escalated: number;
}> {
	const due = await listReadyDeadlineDueOrdersDB({ now });
	let lateMarked = 0;

	for (const order of due) {
		const marked = await markBuyerOrderLateDB({
			id: order._id.toString(),
			now,
		});
		if (!marked) continue;
		lateMarked += 1;

		const vendor = await getVendorProfileByIdDB({
			id: marked.vendorId.toString(),
		});
		const vendorName = vendor?.businessName || "Your vendor";

		void notifyOrderRunningLate({
			buyerId: marked.buyerId.toString(),
			orderNumber: marked.orderNumber,
			vendorName,
			expectedReadyAt: marked.expectedReadyAt,
			data: { orderId: marked._id.toString() },
		}).catch((error) =>
			console.error(
				`[orders] ORDER_RUNNING_LATE notification failed for ${marked._id}:`,
				error,
			),
		);

		if (vendor?.userId) {
			void notifyVendorOrderRunningLate({
				vendorUserId: vendor.userId.toString(),
				orderNumber: marked.orderNumber,
				maxExtensions: MAX_READY_EXTENSIONS,
				data: { orderId: marked._id.toString() },
			}).catch((error) =>
				console.error(
					`[orders] ORDER_RUNNING_LATE_VENDOR notification failed for ${marked._id}:`,
					error,
				),
			);
		}
	}

	const escalationDue = await listLateOrdersForEscalationDB({
		now,
		delayMs: SIGNIFICANT_LATE_DELAY_MS,
	});
	let escalated = 0;

	for (const order of escalationDue) {
		const reason = "Order significantly delayed after expected ready time.";
		const marked = await markBuyerOrderLateEscalatedDB({
			id: order._id.toString(),
			now,
			reason,
		});
		if (!marked) continue;
		escalated += 1;

		void notifyOrderLateEscalated({
			buyerId: marked.buyerId.toString(),
			orderNumber: marked.orderNumber,
			data: { orderId: marked._id.toString() },
		}).catch((error) =>
			console.error(
				`[orders] ORDER_LATE_ESCALATED notification failed for ${marked._id}:`,
				error,
			),
		);

		void notifyAdminAttention({
			kind: "SYSTEM_MANUAL_REVIEW",
			title: "Late order needs review",
			whatHappened: `Order ${marked.orderNumber} is significantly delayed and needs admin review.`,
			submittedBy: "System",
			recordId: marked._id.toString(),
			adminPath: `/admin/orders?detail=${marked._id.toString()}`,
			dedupeKey: `order:${marked.orderNumber}:admin:late-escalated`,
		}).catch((error) =>
			console.error(
				`[orders] late admin escalation failed for ${marked._id}:`,
				error,
			),
		);
	}

	return { lateMarked, escalated };
}

export async function reviseReadyEstimate({
	vendorUserId,
	orderId,
	revisedPrepMin,
	now = new Date(),
}: {
	vendorUserId: string;
	orderId: string;
	revisedPrepMin: number;
	now?: Date;
}) {
	if (revisedPrepMin < 5 || revisedPrepMin > 240) {
		throw validationError(
			"Choose a revised estimate between 5 and 240 minutes.",
		);
	}

	const vendor = await getVendorProfileByUserIdDB({ userId: vendorUserId });
	if (!vendor) throw ErrForbidden;

	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (order.vendorId.toString() !== vendor._id.toString()) {
		throw ErrForbidden;
	}
	if (!order.lateMarkedAt) {
		throw invalidOrderState(
			"Only late orders can receive a revised estimate.",
		);
	}
	if ((order.readyExtensionCount ?? 0) >= MAX_READY_EXTENSIONS) {
		throw invalidOrderState(
			"This order has reached the estimate revision limit.",
		);
	}

	const revisedReadyAt = new Date(now.getTime() + revisedPrepMin * 60 * 1000);
	const updated = await reviseBuyerOrderReadyEstimateDB({
		id: orderId,
		vendorId: vendor._id.toString(),
		now,
		revisedPrepMin,
		revisedReadyAt,
		maxExtensions: MAX_READY_EXTENSIONS,
	});
	if (!updated) {
		throw invalidOrderState("Order changed. Please refresh and try again.");
	}

	void notifyOrderReadyEstimateRevised({
		buyerId: updated.buyerId.toString(),
		orderNumber: updated.orderNumber,
		vendorName: vendor.businessName || "Your vendor",
		revisedReadyAt,
		data: { orderId: updated._id.toString() },
	}).catch((error) =>
		console.error(
			`[orders] ORDER_READY_ESTIMATE_REVISED notification failed for ${orderId}:`,
			error,
		),
	);

	return updated;
}
