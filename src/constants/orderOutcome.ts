import type { BuyerOrder } from "@/types";

export interface OrderOutcomeSummary {
	title: string;
	reason?: string;
	actor: "buyer" | "vendor" | "system";
	occurredAt?: string;
}

export function orderOutcomeSummary(
	order: Pick<
		BuyerOrder,
		| "status"
		| "updatedAt"
		| "vendorNoResponseExpiredAt"
		| "vendorRejectedAt"
		| "vendorRejectionExplanation"
		| "cancellationReason"
		| "cancellationExplanation"
		| "cancelledBy"
	>,
): OrderOutcomeSummary | null {
	if (
		order.status === "EXPIRED_VENDOR_NO_RESPONSE" ||
		order.vendorNoResponseExpiredAt
	) {
		return {
			title: "Kitchen did not accept in time",
			reason: "Acceptance deadline expired",
			actor: "system",
			occurredAt: order.vendorNoResponseExpiredAt ?? order.updatedAt,
		};
	}
	if (order.vendorRejectionExplanation || order.status === "VENDOR_REJECTED") {
		return {
			title: "Rejected by kitchen",
			reason: order.vendorRejectionExplanation ?? undefined,
			actor: "vendor",
			occurredAt: order.vendorRejectedAt ?? order.updatedAt,
		};
	}
	if (order.cancelledBy === "vendor") {
		return {
			title: "Cancelled by kitchen",
			reason:
				order.cancellationExplanation ??
				order.cancellationReason ??
				undefined,
			actor: "vendor",
			occurredAt: order.updatedAt,
		};
	}
	if (order.cancelledBy === "buyer") {
		return {
			title: "Cancelled by you",
			reason:
				order.cancellationExplanation ??
				order.cancellationReason ??
				undefined,
			actor: "buyer",
			occurredAt: order.updatedAt,
		};
	}
	if (order.cancelledBy === "system") {
		return {
			title: "Order cancelled",
			reason:
				order.cancellationExplanation ??
				order.cancellationReason ??
				undefined,
			actor: "system",
			occurredAt: order.updatedAt,
		};
	}
	return null;
}

export function refundOutcomeLabel(
	order: Pick<BuyerOrder, "status" | "refundStatus">,
): string | null {
	if (order.status === "REFUNDED" || order.refundStatus === "SENT_TO_PROVIDER") {
		return "Refunded";
	}
	if (
		order.status === "REFUND_PENDING" ||
		order.status === "REFUND_PROCESSING" ||
		order.refundStatus === "INITIATED"
	) {
		return "Refund processing";
	}
	if (order.status === "REFUND_FAILED") return "Refund needs review";
	return null;
}
