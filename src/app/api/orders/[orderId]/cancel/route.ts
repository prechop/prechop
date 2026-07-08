import { ErrInvalidFields } from "@/server/constants";
import {
	assertBuyer,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { cancelOrderAsBuyer } from "@/server/services/buyerOrders";
import { cancelOrderBodySchema } from "@/server/validators/buyerOrders/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/orders/[orderId]/cancel" },
	withAuth(async ({ req, auth, context }) => {
		try {
			assertBuyer(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const parsed = cancelOrderBodySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await cancelOrderAsBuyer({
				buyerId: auth.userId,
				orderId,
				reason: parsed.data.reason,
			});
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	}),
);
