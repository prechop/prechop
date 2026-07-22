import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { reportBuyerUnreachable } from "@/server/services/buyerOrders";
import { buyerUnreachableBodySchema } from "@/server/validators/buyerOrders/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendor/orders/[orderId]/buyer-unreachable" },
	withAuth(async ({ req, auth, context }) => {
		try {
			assertVendor(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const parsed = buyerUnreachableBodySchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await reportBuyerUnreachable({
					vendorUserId: auth.userId,
					orderId,
					...parsed.data,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
