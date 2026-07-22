import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { markDeliveryFailed } from "@/server/services/buyerOrders";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendor/orders/[orderId]/delivery-failed" },
	withAuth(async ({ auth, context }) => {
		try {
			assertVendor(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			return ok(
				await markDeliveryFailed({
					vendorUserId: auth.userId,
					orderId,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
