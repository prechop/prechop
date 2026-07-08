import {
	ErrForbidden,
	ErrOrderNotFound,
	invalidOrderState,
} from "../../constants";
import {
	getBuyerOrderByIdDB,
	getVendorProfileByUserIdDB,
	OrderStatus,
	setBuyerOrderStatusDB,
} from "../../models";
import { createUserNotification } from "../notifications";

const VALID_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
	[OrderStatus.PAID]: [OrderStatus.CONFIRMED],
	[OrderStatus.CONFIRMED]: [OrderStatus.PREPARING],
	[OrderStatus.PREPARING]: [OrderStatus.READY],
	[OrderStatus.READY]: [OrderStatus.COMPLETED],
};

export async function updateOrderStatus({
	vendorUserId,
	orderId,
	status,
}: {
	vendorUserId: string;
	orderId: string;
	status: OrderStatus;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId: vendorUserId });
	if (!vendor) throw ErrForbidden;

	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;
	if (order.vendorId.toString() !== vendor._id.toString()) throw ErrForbidden;

	const allowed = VALID_TRANSITIONS[order.status as OrderStatus] ?? [];
	if (!allowed.includes(status)) {
		throw invalidOrderState(
			`Cannot transition from ${order.status} to ${status}.`,
		);
	}

	const updated = await setBuyerOrderStatusDB({
		id: orderId,
		status,
		fromStatuses: [order.status as OrderStatus],
	});
	if (!updated)
		throw invalidOrderState("Order status changed — please retry.");

	if (status === OrderStatus.CONFIRMED || status === OrderStatus.READY) {
		createUserNotification({
			userId: order.buyerId.toString(),
			title:
				status === OrderStatus.READY
					? "Order ready"
					: "Order confirmed",
			body:
				status === OrderStatus.READY
					? `Your order ${order.orderNumber} is ready to collect.`
					: `Your order ${order.orderNumber} was confirmed.`,
			type: `ORDER_${status}`,
			data: { orderNumber: order.orderNumber },
		});
	}

	return updated;
}
