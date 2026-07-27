import { ErrForbidden, ErrOrderNotFound } from "../../constants";
import {
	FulfillmentType,
	getBuyerOrderByIdDB,
	getPaymentByOrderIdDB,
	getRefundByPaymentIdDB,
	getVendorProfileByIdDB,
	getVendorProfileByUserIdDB,
	listBuyerOrdersByBuyerDB,
	listBuyerOrdersByVendorAndDailyOrderDB,
	listIncomingBuyerOrdersByVendorDB,
} from "../../models";

function pickupLocation(
	vendor: Awaited<ReturnType<typeof getVendorProfileByIdDB>>,
) {
	if (!vendor) return null;
	return (
		[vendor.hostelOrStallName, vendor.areaOrAddress]
			.map((part) => part?.trim())
			.filter(Boolean)
			.join(" · ") || null
	);
}

function plainOrder<T>(order: T): T {
	const maybeDocument = order as T & { toObject?: () => T };
	return maybeDocument.toObject ? maybeDocument.toObject() : { ...order };
}

function redactVendorDeliveryContact<T extends { fulfillmentType?: unknown }>(
	order: T,
): T {
	if (order.fulfillmentType !== FulfillmentType.DELIVERY) {
		return order;
	}
	const copy = plainOrder(order) as T & Record<string, unknown>;
	delete copy.deliveryHostelName;
	delete copy.deliveryRoomNumber;
	delete copy.deliveryAdditionalInfo;
	delete copy.deliveryFullAddress;
	delete copy.deliveryPhone;
	delete copy.customerMessage;
	return copy;
}

export function getMyOrders({
	buyerId,
	limit,
	offset,
}: {
	buyerId: string;
	limit?: number;
	offset?: number;
}) {
	return listBuyerOrdersByBuyerDB({ buyerId, limit, offset });
}

export async function getOrderById({
	userId,
	orderId,
}: {
	userId: string;
	orderId: string;
}) {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) throw ErrOrderNotFound;

	const orderWithPickupLocation = async () => {
		const [vendor, payment] = await Promise.all([
			getVendorProfileByIdDB({
				id: order.vendorId.toString(),
			}),
			getPaymentByOrderIdDB({ buyerOrderId: order._id.toString() }),
		]);
		const refund = payment
			? await getRefundByPaymentIdDB({
					paymentId: payment._id.toString(),
				})
			: null;
		return {
			...order,
			vendorPickupLocation: pickupLocation(vendor),
			refundAmountKobo: refund?.amountKobo ?? null,
			refundReference: refund?.paystackRefundId ?? null,
			refundStatus: refund?.processedAt
				? "SENT_TO_PROVIDER"
				: refund
					? "INITIATED"
					: null,
		};
	};

	const isBuyer = order.buyerId.toString() === userId;
	if (isBuyer) return orderWithPickupLocation();

	// Otherwise only the owning vendor may view it.
	const vendor = await getVendorProfileByUserIdDB({ userId });
	if (vendor && order.vendorId.toString() === vendor._id.toString()) {
		return redactVendorDeliveryContact(await orderWithPickupLocation());
	}
	throw ErrForbidden;
}

export async function getVendorOrdersForDailyOrder({
	vendorUserId,
	dailyOrderId,
}: {
	vendorUserId: string;
	dailyOrderId: string;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId: vendorUserId });
	if (!vendor) throw ErrForbidden;
	const orders = await listBuyerOrdersByVendorAndDailyOrderDB({
		vendorId: vendor._id.toString(),
		dailyOrderId,
	});
	return orders.map((order) => redactVendorDeliveryContact(order));
}

export async function getIncomingVendorOrders({
	vendorUserId,
	limit,
}: {
	vendorUserId: string;
	limit?: number;
}) {
	const vendor = await getVendorProfileByUserIdDB({ userId: vendorUserId });
	if (!vendor) throw ErrForbidden;
	const orders = await listIncomingBuyerOrdersByVendorDB({
		vendorId: vendor._id.toString(),
		limit,
	});
	return orders.map((order) => redactVendorDeliveryContact(order));
}
