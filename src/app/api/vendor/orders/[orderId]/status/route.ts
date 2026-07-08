import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { updateOrderStatus } from "@/server/services/buyerOrders";
import { updateOrderStatusBodySchema } from "@/server/validators/buyerOrders/validate";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/vendor/orders/[orderId]/status" },
	withAuth(async ({ req, auth, context }) => {
		try {
			assertVendor(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const parsed = updateOrderStatusBodySchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const result = await updateOrderStatus({
				vendorUserId: auth.userId,
				orderId,
				status: parsed.data.status,
			});
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	}),
);
