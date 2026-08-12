import {
	ErrOrderNotFound,
	invalidOrderState,
	validationError,
} from "../../constants";
import {
	getBuyerOrderByIdDB,
	getOrderDisputeByIdDB,
	getVendorProfileByIdDB,
	type IBuyerOrder,
	type IOrderDispute,
	listOrderDisputesDB,
	type OrderDisputeAction,
	type OrderDisputeStatus,
	OrderStatus,
	setBuyerOrderStatusDB,
	updateOrderDisputeReviewDB,
} from "../../models";
import { recordAudit } from "../audit";
import { createUserNotification } from "../notifications";
import { openOrderDisputeForReview } from "../orderDisputes";
import { refreshVendorPayableForOrder } from "../vendorPayouts";
import { refundOrderAsAdmin } from "./refunds";
import type { AdminActor } from "./vendors";

export function permissionForDisputeAction(action: OrderDisputeAction) {
	return action === "ISSUE_FULL_REFUND" || action === "ISSUE_PARTIAL_REFUND"
		? "refund:create"
		: "support:update";
}

export function listDisputes({
	status,
	limit,
	offset,
}: {
	status?: OrderDisputeStatus;
	limit?: number;
	offset?: number;
} = {}) {
	return listOrderDisputesDB({ status, limit, offset });
}

export function listDisputesForOrder(orderId: string) {
	return listOrderDisputesDB({ buyerOrderId: orderId, limit: 100 });
}

export function openDisputeForOrder(
	input: Parameters<typeof openOrderDisputeForReview>[0],
) {
	return openOrderDisputeForReview(input);
}

export async function reviewOrderDisputeAsAdmin({
	disputeId,
	action,
	note,
	amountKobo,
	actor,
	now = new Date(),
}: {
	disputeId: string;
	action: OrderDisputeAction;
	note?: string;
	amountKobo?: number;
	actor: AdminActor;
	now?: Date;
}): Promise<IOrderDispute> {
	const dispute = await getOrderDisputeByIdDB({ id: disputeId });
	if (!dispute) throw ErrOrderNotFound;
	const orderId = dispute.buyerOrderId.toString();
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (dispute.status === "RESOLVED") {
		throw invalidOrderState("This dispute has already been resolved.");
	}
	const trimmedNote = note?.trim();
	if (!trimmedNote) {
		throw validationError("Add an admin note for this dispute action.");
	}

	let nextStatus: OrderDisputeStatus = "RESOLVED";
	if (action === "REQUEST_MORE_EVIDENCE") {
		nextStatus = "MORE_EVIDENCE_REQUESTED";
	} else if (action === "ISSUE_PARTIAL_REFUND") {
		throw invalidOrderState(
			"Partial refunds are not supported safely yet. Issue a full refund or choose another action.",
		);
	} else if (action === "ISSUE_FULL_REFUND") {
		await refundOrderAsAdmin({
			orderId,
			reason: trimmedNote,
			actor,
		});
	} else if (
		dispute.reason === "BUYER_NO_SHOW_COMPLAINT" &&
		(action === "UPHOLD_COMPLETION" || action === "REJECT_DISPUTE")
	) {
		const completed = await setBuyerOrderStatusDB({
			id: orderId,
			status: OrderStatus.COMPLETED_BUYER_NO_SHOW,
			fromStatuses: [
				OrderStatus.PICKUP_PROBLEM_REPORTED,
				OrderStatus.COMPLETED_BUYER_NO_SHOW,
			],
			confirmedAt: now,
			confirmedBy: actor.userId,
			confirmationMethod: "SUPPORT",
			confirmationOrderId: orderId,
			trustedCompletionAuditRef: `admin-support:${disputeId}`,
		});
		if (!completed) {
			throw invalidOrderState(
				"The pickup dispute order changed status. Refresh and review it again.",
			);
		}
	}

	const updated = await updateOrderDisputeReviewDB({
		id: disputeId,
		status: nextStatus,
		action,
		note: trimmedNote,
		adminUserId: actor.userId,
		resolvedAt: nextStatus === "RESOLVED" ? now : undefined,
	});
	if (!updated) throw validationError("Could not update dispute review.");

	recordAudit({
		userId: actor.userId,
		role: actor.role,
		action: "ORDER_DISPUTE_REVIEW",
		resourceType: "orderDisputes",
		resourceId: disputeId,
		previousState: {
			status: dispute.status,
			reason: dispute.reason,
		},
		newState: {
			status: updated.status,
			action,
			note: trimmedNote,
			amountKobo,
			buyerOrderId: dispute.buyerOrderId.toString(),
		},
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});

	await notifyOrderDisputeDecision({
		order,
		dispute: updated,
		action,
		note: trimmedNote,
	});
	await refreshVendorPayableForOrder({ orderId });

	return updated;
}

async function notifyOrderDisputeDecision({
	order,
	dispute,
	action,
	note,
}: {
	order: IBuyerOrder;
	dispute: IOrderDispute;
	action: OrderDisputeAction;
	note: string;
}): Promise<void> {
	const orderId = order._id.toString();
	const isEvidenceRequest = action === "REQUEST_MORE_EVIDENCE";
	const isRefund = action === "ISSUE_FULL_REFUND";
	const buyerBody = isEvidenceRequest
		? `Support needs more information about order ${order.orderNumber}: ${note}`
		: isRefund
			? `Your report for order ${order.orderNumber} was resolved in your favour. A full refund was issued.`
			: `Support reviewed order ${order.orderNumber} and upheld the vendor's buyer no-show report.`;
	const vendorBody = isEvidenceRequest
		? `Support requested more information for order ${order.orderNumber}: ${note}`
		: isRefund
			? `Support resolved the pickup dispute for order ${order.orderNumber} in the buyer's favour and issued a full refund.`
			: `Support reviewed order ${order.orderNumber} and upheld your buyer no-show report.`;

	await createUserNotification({
		userId: order.buyerId.toString(),
		title: isEvidenceRequest
			? "Support needs more information"
			: "Pickup dispute resolved",
		body: buyerBody,
		type: isEvidenceRequest
			? "ORDER_DISPUTE_MORE_EVIDENCE"
			: "ORDER_DISPUTE_RESOLVED",
		dedupeKey: `dispute:${dispute._id.toString()}:buyer:${action}`,
		data: {
			orderId,
			disputeId: dispute._id.toString(),
			action,
			url: `/my-orders/${orderId}`,
		},
	});

	const vendor = await getVendorProfileByIdDB({
		id: order.vendorId.toString(),
	});
	if (!vendor?.userId) return;
	await createUserNotification({
		userId: vendor.userId.toString(),
		title: isEvidenceRequest
			? "Support needs more information"
			: "Pickup dispute resolved",
		body: vendorBody,
		type: isEvidenceRequest
			? "ORDER_DISPUTE_MORE_EVIDENCE"
			: "ORDER_DISPUTE_RESOLVED",
		dedupeKey: `dispute:${dispute._id.toString()}:vendor:${action}`,
		data: {
			orderId,
			disputeId: dispute._id.toString(),
			action,
			url: "/vendor/pipeline",
		},
	});
}
