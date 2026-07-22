import {
	ErrForbidden,
	ErrOrderNotFound,
	invalidOrderState,
	validationError,
} from "@/server/constants";
import {
	completeExpiredPickupNoShowDB,
	FulfillmentType,
	findExpiredPickupNoShowResponsesDB,
	findReadyPickupOrdersForNoShowTimersDB,
	getBuyerOrderByIdDB,
	getVendorProfileByUserIdDB,
	markDeliveryFailedDB,
	markPickupNoShowReportableDB,
	markPickupReminderSentDB,
	OrderStatus,
	reportBuyerUnreachableDB,
	reportPickupNoShowDB,
	respondToPickupNoShowDB,
	SETTLED_ORDER_STATUSES,
} from "@/server/models";
import {
	notifyBuyerUnreachableUrgent,
	notifyPickupNoShowReminder,
	notifyPickupNoShowResponseRequired,
} from "../notifications";
import { openOrderDisputeForReview } from "../orderDisputes";
import { generateReceiptInBackground } from "./receiptPdf";

const PICKUP_REMINDER_MS = 60 * 60 * 1000;
const PICKUP_WARNING_MS = 90 * 60 * 1000;
const PICKUP_REPORT_MS = 120 * 60 * 1000;
const BUYER_RESPONSE_MS = 15 * 60 * 1000;

function pickupClockStart(order: { readyAt?: Date; updatedAt: Date }): Date {
	return order.readyAt ?? order.updatedAt;
}

async function assertVendorOwnsOrder(vendorUserId: string, orderId: string) {
	const vendor = await getVendorProfileByUserIdDB({ userId: vendorUserId });
	if (!vendor) throw ErrForbidden;
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (order.vendorId.toString() !== vendor._id.toString()) {
		throw ErrForbidden;
	}
	return { vendor, order };
}

export async function reportPickupNoShow({
	vendorUserId,
	orderId,
	now = new Date(),
}: {
	vendorUserId: string;
	orderId: string;
	now?: Date;
}) {
	const { order } = await assertVendorOwnsOrder(vendorUserId, orderId);
	if (order.fulfillmentType !== FulfillmentType.PICKUP) {
		throw invalidOrderState(
			"Only pickup orders can be reported uncollected.",
		);
	}
	if (order.status !== OrderStatus.READY) {
		throw invalidOrderState("Only ready pickup orders can be reported.");
	}
	const start = pickupClockStart(order);
	if (now.getTime() - start.getTime() < PICKUP_REPORT_MS) {
		throw invalidOrderState(
			"Buyer did not collect can be reported after 120 minutes.",
		);
	}
	const responseDeadline = new Date(now.getTime() + BUYER_RESPONSE_MS);
	const updated = await reportPickupNoShowDB({
		id: orderId,
		vendorUserId,
		reportedAt: now,
		responseDeadline,
	});
	if (!updated) {
		throw invalidOrderState("Order status changed - please retry.");
	}
	void notifyPickupNoShowResponseRequired({
		buyerId: order.buyerId.toString(),
		orderNumber: order.orderNumber,
		responseDeadline,
		data: { orderId },
	}).catch((error) =>
		console.error(
			`[orders] pickup no-show response notification failed for ${orderId}:`,
			error,
		),
	);
	return updated;
}

export async function respondToPickupNoShow({
	buyerId,
	orderId,
	response,
	note,
	now = new Date(),
}: {
	buyerId: string;
	orderId: string;
	response: "CONFIRMED_COLLECTION" | "PROBLEM_REPORTED";
	note?: string;
	now?: Date;
}) {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (order.buyerId.toString() !== buyerId) throw ErrForbidden;
	if (order.status !== OrderStatus.AWAITING_BUYER_NO_SHOW_RESPONSE) {
		throw invalidOrderState("This order is not awaiting buyer response.");
	}
	if (
		order.pickupBuyerResponseDeadline &&
		now > order.pickupBuyerResponseDeadline
	) {
		throw invalidOrderState("The buyer response window has closed.");
	}
	if (response === "PROBLEM_REPORTED" && !note?.trim()) {
		throw validationError("Describe the pickup problem.");
	}
	const updated = await respondToPickupNoShowDB({
		id: orderId,
		buyerId,
		response,
		note: note?.trim(),
		respondedAt: now,
	});
	if (!updated) {
		throw invalidOrderState("Order status changed - please retry.");
	}
	if (response === "CONFIRMED_COLLECTION") {
		generateReceiptInBackground(orderId);
	} else {
		void openOrderDisputeForReview({
			orderId,
			reason: "BUYER_NO_SHOW_COMPLAINT",
			buyerNotes: note?.trim() ? [note.trim()] : [],
		}).catch((error) =>
			console.error(
				`[orders] pickup no-show complaint review failed for ${orderId}:`,
				error,
			),
		);
	}
	return updated;
}

export async function reportBuyerUnreachable({
	vendorUserId,
	orderId,
	arrivalTime,
	contactAttempts,
	note,
	photoUrl,
	now = new Date(),
}: {
	vendorUserId: string;
	orderId: string;
	arrivalTime: Date;
	contactAttempts: number;
	note: string;
	photoUrl?: string;
	now?: Date;
}) {
	const { order } = await assertVendorOwnsOrder(vendorUserId, orderId);
	if (order.fulfillmentType !== FulfillmentType.DELIVERY) {
		throw invalidOrderState("Only delivery orders can use this flow.");
	}
	if (order.status !== OrderStatus.IN_TRANSIT) {
		throw invalidOrderState("Only in-transit orders can be reported.");
	}
	if (contactAttempts < 1) {
		throw validationError("At least one contact attempt is required.");
	}
	if (!note.trim()) {
		throw validationError("Add a short note.");
	}
	if (arrivalTime.getTime() > now.getTime() + 60_000) {
		throw validationError("Arrival time cannot be in the future.");
	}
	const responseDeadline = new Date(now.getTime() + BUYER_RESPONSE_MS);
	const updated = await reportBuyerUnreachableDB({
		id: orderId,
		vendorUserId,
		reportedAt: now,
		responseDeadline,
		arrivalTime,
		contactAttempts,
		note: note.trim(),
		photoUrl: photoUrl?.trim() || undefined,
	});
	if (!updated) {
		throw invalidOrderState("Order status changed - please retry.");
	}
	void notifyBuyerUnreachableUrgent({
		buyerId: order.buyerId.toString(),
		orderNumber: order.orderNumber,
		responseDeadline,
		data: { orderId },
	}).catch((error) =>
		console.error(
			`[orders] buyer unreachable notification failed for ${orderId}:`,
			error,
		),
	);
	return updated;
}

export async function markDeliveryFailed({
	vendorUserId,
	orderId,
	now = new Date(),
}: {
	vendorUserId: string;
	orderId: string;
	now?: Date;
}) {
	const { order } = await assertVendorOwnsOrder(vendorUserId, orderId);
	if (order.status !== OrderStatus.BUYER_UNREACHABLE_REPORTED) {
		throw invalidOrderState("Buyer unreachable must be reported first.");
	}
	if (
		!order.deliveryBuyerResponseDeadline ||
		now < order.deliveryBuyerResponseDeadline
	) {
		throw invalidOrderState(
			"Wait 15 minutes before marking delivery failed.",
		);
	}
	const updated = await markDeliveryFailedDB({
		id: orderId,
		vendorUserId,
		failedAt: now,
	});
	if (!updated) {
		throw invalidOrderState("Order status changed - please retry.");
	}
	void openOrderDisputeForReview({
		orderId,
		reason: "FAILED_DELIVERY",
		vendorNotes: [order.deliveryFailureNote ?? "Delivery failed."],
		photos: order.deliveryEvidencePhotoUrl
			? [order.deliveryEvidencePhotoUrl]
			: [],
	}).catch((error) =>
		console.error(
			`[orders] failed-delivery admin review failed for ${orderId}:`,
			error,
		),
	);
	return updated;
}

export async function sweepPickupNoShowTimers({
	now = new Date(),
	limit,
}: {
	now?: Date;
	limit?: number;
} = {}): Promise<{
	reminder60: number;
	warning90: number;
	reportEnabled: number;
	completedNoResponse: number;
}> {
	const ready = await findReadyPickupOrdersForNoShowTimersDB({ now, limit });
	let reminder60 = 0;
	let warning90 = 0;
	let reportEnabled = 0;
	for (const order of ready) {
		const start = pickupClockStart(order);
		const elapsed = now.getTime() - start.getTime();
		if (elapsed >= PICKUP_REMINDER_MS && !order.pickupReminder60SentAt) {
			const marked = await markPickupReminderSentDB({
				id: order._id.toString(),
				kind: "reminder60",
				sentAt: now,
			});
			if (marked) {
				reminder60 += 1;
				void notifyPickupNoShowReminder({
					buyerId: order.buyerId.toString(),
					orderNumber: order.orderNumber,
					minutesElapsed: 60,
					data: { orderId: order._id.toString() },
				});
			}
		}
		if (elapsed >= PICKUP_WARNING_MS && !order.pickupWarning90SentAt) {
			const marked = await markPickupReminderSentDB({
				id: order._id.toString(),
				kind: "warning90",
				sentAt: now,
			});
			if (marked) {
				warning90 += 1;
				void notifyPickupNoShowReminder({
					buyerId: order.buyerId.toString(),
					orderNumber: order.orderNumber,
					minutesElapsed: 90,
					data: { orderId: order._id.toString() },
				});
			}
		}
		if (elapsed >= PICKUP_REPORT_MS && !order.pickupNoShowReportableAt) {
			const marked = await markPickupNoShowReportableDB({
				id: order._id.toString(),
				reportableAt: now,
			});
			if (marked) reportEnabled += 1;
		}
	}

	const expired = await findExpiredPickupNoShowResponsesDB({ now, limit });
	let completedNoResponse = 0;
	for (const order of expired) {
		const completed = await completeExpiredPickupNoShowDB({
			id: order._id.toString(),
			completedAt: now,
		});
		if (completed) completedNoResponse += 1;
	}
	return { reminder60, warning90, reportEnabled, completedNoResponse };
}

export function isNoShowOrFailedDeliveryFinanciallySettled(
	status: OrderStatus,
) {
	return SETTLED_ORDER_STATUSES.includes(status);
}
