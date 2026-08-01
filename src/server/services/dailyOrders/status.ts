import { ErrDailyOrderNotFound, ErrForbidden } from "../../constants";
import {
	DailyOrderStatus,
	getDailyOrderByIdDB,
	getVendorProfileByUserIdDB,
	setDailyOrderStatusDB,
} from "../../models";
import {
	expireExternalPaymentOrdersForDailyOrder,
	refundOrdersForDailyOrder,
} from "../buyerOrders";

export async function closeDailyOrder({
	userId,
	orderId,
	reason,
}: {
	userId: string;
	orderId: string;
	reason?: string;
}) {
	void reason;
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrForbidden;
	const vendorId = vendor._id.toString();

	const ok = await setDailyOrderStatusDB({
		id: orderId,
		vendorId,
		status: DailyOrderStatus.CLOSED,
		fromStatuses: [DailyOrderStatus.ACTIVE],
	});
	if (!ok) throw ErrDailyOrderNotFound;

	const expiredExternalPayments =
		await expireExternalPaymentOrdersForDailyOrder({
			vendorId,
			dailyOrderId: orderId,
		});

	return {
		...((await getDailyOrderByIdDB({ id: orderId })) ?? { id: orderId }),
		refund: { refunded: 0, failed: 0 },
		expiredExternalPayments,
	};
}

export async function cancelDailyOrder({
	userId,
	orderId,
}: {
	userId: string;
	orderId: string;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrForbidden;

	const vendorId = vendor._id.toString();
	const ok = await setDailyOrderStatusDB({
		id: orderId,
		vendorId,
		status: DailyOrderStatus.CANCELLED,
		fromStatuses: [
			DailyOrderStatus.ACTIVE,
			DailyOrderStatus.CLOSED,
			DailyOrderStatus.DRAFT,
		],
	});
	if (!ok) throw ErrDailyOrderNotFound;

	const refund = await refundOrdersForDailyOrder({
		vendorId,
		dailyOrderId: orderId,
		reason: "Vendor cancelled this listing.",
	});
	const expiredExternalPayments =
		await expireExternalPaymentOrdersForDailyOrder({
			vendorId,
			dailyOrderId: orderId,
			reason: "Vendor cancelled this listing.",
		});

	return {
		id: orderId,
		status: DailyOrderStatus.CANCELLED,
		refund,
		expiredExternalPayments,
	};
}
