import {
	ErrOrderNotFound,
	invalidOrderState,
	validationError,
} from "../../constants";
import {
	getOrderDisputeByIdDB,
	type IOrderDispute,
	listOrderDisputesDB,
	type OrderDisputeAction,
	type OrderDisputeStatus,
	updateOrderDisputeReviewDB,
} from "../../models";
import { recordAudit } from "../audit";
import { openOrderDisputeForReview } from "../orderDisputes";
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
	if (dispute.status === "RESOLVED") {
		throw invalidOrderState("This dispute has already been resolved.");
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
			orderId: dispute.buyerOrderId.toString(),
			reason: note || `Admin dispute refund: ${dispute.reason}`,
			actor,
		});
	} else if (!note?.trim()) {
		throw validationError("Add an admin note for this dispute action.");
	}

	const updated = await updateOrderDisputeReviewDB({
		id: disputeId,
		status: nextStatus,
		action,
		note: note?.trim(),
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
			note: note?.trim(),
			amountKobo,
			buyerOrderId: dispute.buyerOrderId.toString(),
		},
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});

	return updated;
}
