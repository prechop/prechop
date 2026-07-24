import { ErrForbidden, ErrOrderNotFound } from "../../constants";
import {
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
		return orderWithPickupLocation();
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
	return listBuyerOrdersByVendorAndDailyOrderDB({
		vendorId: vendor._id.toString(),
		dailyOrderId,
	});
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
	return listIncomingBuyerOrdersByVendorDB({
		vendorId: vendor._id.toString(),
		limit,
	});
}
