import {
	countBlockingBuyerOrdersDB,
	countBlockingPaymentsDB,
	countBlockingRefundsDB,
	countUnresolvedOrderDisputesDB,
} from "@/server/models";

export interface AccountObligationSummary {
	orders: number;
	payments: number;
	refunds: number;
	disputes: number;
	payouts: number;
	hasOutstandingObligations: boolean;
}

/**
 * One shared safety check for closing a vendor profile or the whole account.
 * Prechop currently has no separate payout ledger, so payout obligations are
 * represented by the payment/order/refund lifecycle and remain zero here.
 */
export async function getAccountObligations({
	buyerId,
	vendorId,
}: {
	buyerId?: string;
	vendorId?: string;
}): Promise<AccountObligationSummary> {
	const [orders, payments, refunds, disputes] = await Promise.all([
		countBlockingBuyerOrdersDB({ buyerId, vendorId }),
		countBlockingPaymentsDB({ buyerId, vendorId }),
		countBlockingRefundsDB({ buyerId, vendorId }),
		countUnresolvedOrderDisputesDB({ buyerId, vendorId }),
	]);
	const payouts = 0;
	return {
		orders,
		payments,
		refunds,
		disputes,
		payouts,
		hasOutstandingObligations:
			orders + payments + refunds + disputes + payouts > 0,
	};
}

export function describeAccountObligations(
	obligations: AccountObligationSummary,
): string {
	const labels = [
		[obligations.orders, "order"],
		[obligations.payments, "payment"],
		[obligations.refunds, "refund"],
		[obligations.disputes, "dispute"],
		[obligations.payouts, "payout"],
	]
		.filter(([count]) => Number(count) > 0)
		.map(
			([count, label]) =>
				`${count} ${label}${Number(count) === 1 ? "" : "s"}`,
		);
	return labels.join(", ");
}
