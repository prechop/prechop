import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { cancelOrderAsVendor } from "@/server/services/buyerOrders";
import { cancelOrderBodySchema } from "@/server/validators/buyerOrders/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendor/orders/[orderId]/cancel" },
	withAuth(async ({ req, auth, context }) => {
		try {
			assertVendor(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const parsed = cancelOrderBodySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await cancelOrderAsVendor({
				vendorUserId: auth.userId,
				orderId,
				reason: parsed.data.reason,
			});
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	}),
);
