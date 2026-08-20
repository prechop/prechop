import { ErrForbidden, ErrOrderNotFound, notFound } from "@/server/constants";
import {
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	confirmBuyerReceipt,
	getOrderById,
} from "@/server/services/buyerOrders";
import { OrderStatus } from "@/server/models";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/orders/[orderId]/confirm-receipt" },
	withAuth(async ({ auth, context }) => {
		try {
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const order = await getOrderById({
				userId: auth.userId,
				orderId,
			});
			if (!order) throw ErrOrderNotFound;
			if (order.buyerId !== auth.userId) throw ErrForbidden;
			if (
				order.fulfillmentType !== "DELIVERY" ||
				order.status !== OrderStatus.IN_TRANSIT
			) {
				throw notFound("Order is not ready for receipt confirmation.");
			}

			const updated = await confirmBuyerReceipt({
				orderId,
				buyerId: auth.userId,
			});
			if (!updated) throw ErrOrderNotFound;
			return ok(updated);
		} catch (e) {
			return handleError(e);
		}
	}),
);
