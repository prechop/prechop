import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { updateDailyOrder } from "@/server/services/dailyOrders";
import { updateDailyOrderDraftSchema } from "@/server/validators/dailyOrders/validate";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/daily-orders/[orderId]" },
	withAuth(async ({ req, auth, context }) => {
		try {
			assertVendor(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const parsed = updateDailyOrderDraftSchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await updateDailyOrder({
					userId: auth.userId,
					orderId,
					input: parsed.data,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
