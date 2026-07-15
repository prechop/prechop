import { aggregatePaymentRevenueDB } from "../../models";

export function getAdminRevenue() {
	return aggregatePaymentRevenueDB();
}
