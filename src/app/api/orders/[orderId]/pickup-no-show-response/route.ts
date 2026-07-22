import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { respondToPickupNoShow } from "@/server/services/buyerOrders";
import { pickupNoShowResponseBodySchema } from "@/server/validators/buyerOrders/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/orders/[orderId]/pickup-no-show-response" },
	withAuth(async ({ req, auth, context }) => {
		try {
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const parsed = pickupNoShowResponseBodySchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await respondToPickupNoShow({
					buyerId: auth.userId,
					orderId,
					...parsed.data,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
