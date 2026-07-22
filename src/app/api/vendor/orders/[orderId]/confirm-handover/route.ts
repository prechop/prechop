import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { confirmOrderHandover } from "@/server/services/buyerOrders";
import { confirmHandoverBodySchema } from "@/server/validators/buyerOrders/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/vendor/orders/[orderId]/confirm-handover",
		rateLimit: { windowMs: 60_000, maxRequests: 20 },
	},
	withAuth(async ({ req, auth, context }) => {
		try {
			assertVendor(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const parsed = confirmHandoverBodySchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const result = await confirmOrderHandover({
				vendorUserId: auth.userId,
				orderId,
				method: parsed.data.method,
				code: parsed.data.code,
			});
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	}),
);
