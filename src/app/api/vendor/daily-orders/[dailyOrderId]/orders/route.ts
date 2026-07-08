import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getVendorOrdersForDailyOrder } from "@/server/services/buyerOrders";

export const runtime = "nodejs";

// Vendor "cooking mode": all paid+ orders for one daily order.
export const GET = withApiHandler(
	{ route: "/api/vendor/daily-orders/[dailyOrderId]/orders" },
	withAuth(async ({ auth, context }) => {
		try {
			assertVendor(auth);
			const { dailyOrderId } = await (
				context as { params: Promise<{ dailyOrderId: string }> }
			).params;
			const orders = await getVendorOrdersForDailyOrder({
				vendorUserId: auth.userId,
				dailyOrderId,
			});
			return ok(orders);
		} catch (error) {
			return handleError(error);
		}
	}),
);
