import { ErrOrderNotFound, invalidOrderState } from "../../constants";
import { getBuyerOrderByIdDB, OrderStatus } from "../../models";
import { recordAudit } from "../audit";
import { issueRefund } from "../refunds";
import type { AdminActor } from "./vendors";

/**
 * Statuses an operator may refund from.
 *
 * CANCELLED is included on purpose — an order whose automatic refund failed
 * lands there with the buyer's money still gone, and that is precisely the case
 * a manual refund exists to resolve. PENDING_PAYMENT / AWAITING_EXTERNAL_PAYMENT
 * are excluded because no money was ever captured, and REFUNDED is excluded
 * because `issueRefund` would report ALREADY_REFUNDED anyway — rejecting here
 * gives the operator a clearer answer than a silent no-op.
 */
const REFUNDABLE: OrderStatus[] = [
	OrderStatus.PAID,
	OrderStatus.CONFIRMED,
	OrderStatus.PREPARING,
	OrderStatus.READY,
	OrderStatus.COMPLETED,
	OrderStatus.CANCELLED,
];

export interface AdminRefundResult {
	orderId: string;
	orderNumber: string;
	outcome: "REFUNDED" | "ALREADY_REFUNDED";
	amountKobo: number;
	refundId: string;
	paystackRefundId?: string;
	message: string;
}

/**
 * PRD §8.14 — operator-initiated refund. The only path by which a human can move
 * money out of Prechop, and the resolution for anything the automatic sweeps
 * cannot fix.
 *
 * Authorisation is the route's job (`refund:create`); this enforces the domain
 * rules: refundable status, and a full-total refund only. `amountKobo` is
 * accepted for API compatibility but, in v1, partial refunds are intentionally
 * NOT supported — any value other than the full order total is rejected. The
 * refund always moves the full captured amount.
 */
export async function refundOrderAsAdmin({
	orderId,
	amountKobo,
	reason,
	actor,
}: {
	orderId: string;
	amountKobo?: number;
	reason: string;
	actor: AdminActor;
}): Promise<AdminRefundResult> {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;

	if (!REFUNDABLE.includes(order.status as OrderStatus)) {
		throw invalidOrderState(
			order.status === OrderStatus.REFUNDED
				? "This order has already been refunded."
				: `An order in ${order.status} has no captured payment to refund.`,
		);
	}

	// v1 does NOT support partial refunds. On success `issueRefund` flips the whole
	// order + payment to REFUNDED, and `createRefundDB`'s unique `paymentId` index
	// turns any follow-up refund on the same payment into an ALREADY_REFUNDED no-op
	// — so a partial refund would pay out part of the money and strand the
	// remainder forever. Until a real partial-refund state machine exists, an
	// operator may only refund the full captured amount. Reject any `amountKobo`
	// that is not the full order total rather than silently corrupting the order.
	if (amountKobo != null && amountKobo !== order.totalKobo) {
		throw invalidOrderState(
			"Partial refunds are not supported yet — refund the full order total.",
		);
	}

	const result = await issueRefund({
		orderId,
		amountKobo: order.totalKobo,
		reason,
	});

	// Audited after the fact so the log records what actually happened — a
	// refund that threw is not written here as though it succeeded.
	recordAudit({
		userId: actor.userId,
		role: actor.role,
		action: "ORDER_REFUND",
		resourceType: "buyerOrders",
		resourceId: orderId,
		previousState: { status: order.status, totalKobo: order.totalKobo },
		newState: {
			reason,
			amountKobo: result.amountKobo,
			outcome: result.outcome,
			refundId: result.refundId,
			paystackRefundId: result.paystackRefundId,
			partial: result.amountKobo < order.totalKobo,
		},
		ipAddress: actor.ip,
		userAgent: actor.userAgent,
	});

	return {
		orderId,
		orderNumber: order.orderNumber,
		outcome: result.outcome,
		amountKobo: result.amountKobo,
		refundId: result.refundId,
		paystackRefundId: result.paystackRefundId,
		message:
			result.outcome === "ALREADY_REFUNDED"
				? "A refund already exists for this order — no second payout was sent."
				: "Refund issued.",
	};
}
