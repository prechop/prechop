import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { reportPickupNoShow } from "@/server/services/buyerOrders";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendor/orders/[orderId]/pickup-no-show" },
	withAuth(async ({ auth, context }) => {
		try {
			assertVendor(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			return ok(
				await reportPickupNoShow({
					vendorUserId: auth.userId,
					orderId,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
