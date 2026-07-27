import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { revealBuyerContactForVendor } from "@/server/services/buyerOrders";

export const runtime = "nodejs";

const handler = withApiHandler(
	{ route: "/api/vendor/orders/[orderId]/contact/buyer" },
	withAuth(async ({ auth, context }) => {
		try {
			assertVendor(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const result = await revealBuyerContactForVendor({
				vendorUserId: auth.userId,
				orderId,
			});
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const GET = handler;
export const POST = handler;
