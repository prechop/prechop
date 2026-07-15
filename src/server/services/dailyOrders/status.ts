import {
	ErrDailyOrderNotFound,
	ErrForbidden,
	validationError,
} from "../../constants";
import {
	DailyOrderStatus,
	getDailyOrderByIdDB,
	getVendorProfileByUserIdDB,
	listBuyerOrdersByVendorAndDailyOrderDB,
	OrderStatus,
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
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (!vendor) throw ErrForbidden;
	const vendorId = vendor._id.toString();

	const buyerOrders = await listBuyerOrdersByVendorAndDailyOrderDB({
		vendorId,
		dailyOrderId: orderId,
	});
	const cookingStarted = buyerOrders.some((order) =>
		[
			OrderStatus.PREPARING,
			OrderStatus.READY,
			OrderStatus.COMPLETED,
		].includes(order.status),
	);
	if (cookingStarted) {
		throw validationError(
			"This order cannot be closed because food is already being prepared.",
		);
	}
	const refundable = buyerOrders.filter((order) =>
		[OrderStatus.PAID, OrderStatus.CONFIRMED].includes(order.status),
	);
	if (refundable.length > 0 && !reason?.trim()) {
		throw validationError("Enter a cancellation reason before closing.");
	}

	const ok = await setDailyOrderStatusDB({
		id: orderId,
		vendorId,
		status: DailyOrderStatus.CLOSED,
		fromStatuses: [DailyOrderStatus.ACTIVE],
	});
	if (!ok) throw ErrDailyOrderNotFound;

	const refund =
		refundable.length > 0
			? await refundOrdersForDailyOrder({
					vendorId,
					dailyOrderId: orderId,
					reason: reason?.trim(),
				})
			: { refunded: 0, failed: 0 };
	const expiredExternalPayments =
		await expireExternalPaymentOrdersForDailyOrder({
			vendorId,
			dailyOrderId: orderId,
		});

	return {
		...((await getDailyOrderByIdDB({ id: orderId })) ?? { id: orderId }),
		refund,
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
