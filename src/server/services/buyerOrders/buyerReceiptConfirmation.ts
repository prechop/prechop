import mongoose from "mongoose";
import { ErrForbidden, ErrOrderNotFound } from "@/server/constants";
import {
	BuyerOrder,
	OrderStatus,
	getBuyerOrderByIdDB,
	setBuyerOrderStatusDB,
} from "@/server/models";

export async function confirmBuyerReceipt({
	orderId,
	buyerId,
}: {
	orderId: string;
	buyerId: string;
}): Promise<{ id: string; status: OrderStatus } | null> {
	const order = await getBuyerOrderByIdDB({ id: orderId });
	if (!order) return null;
	if (order.buyerId !== buyerId) throw ErrForbidden;
	if (order.fulfillmentType !== "DELIVERY") throw ErrOrderNotFound;
	if (order.status !== OrderStatus.IN_TRANSIT) throw ErrOrderNotFound;

	const updated = await setBuyerOrderStatusDB({
		id: orderId,
		status: OrderStatus.DELIVERED,
		fromStatuses: [OrderStatus.IN_TRANSIT],
		deliveredAt: new Date(),
		confirmedAt: new Date(),
		confirmedBy: buyerId,
		confirmationMethod: "BUYER_BUTTON",
	});
	if (!updated) return null;

	const completed = await BuyerOrder.findOneAndUpdate(
		{
			_id: new mongoose.Types.ObjectId(orderId),
			status: OrderStatus.DELIVERED,
		},
		{ $set: { status: OrderStatus.COMPLETED } },
		{ returnDocument: "after" },
	);
	return completed
		? { id: completed._id.toString(), status: OrderStatus.COMPLETED }
		: null;
}
