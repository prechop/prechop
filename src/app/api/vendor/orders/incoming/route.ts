import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getIncomingVendorOrders } from "@/server/services/buyerOrders";

export const runtime = "nodejs";

// Vendor dashboard: paid orders that still need vendor attention, across every
// active listing and payment source.
export const GET = withApiHandler(
	{ route: "/api/vendor/orders/incoming" },
	withAuth(async ({ auth }) => {
		try {
			assertVendor(auth);
			const orders = await getIncomingVendorOrders({
				vendorUserId: auth.userId,
			});
			return ok(orders);
		} catch (error) {
			return handleError(error);
		}
	}),
);
