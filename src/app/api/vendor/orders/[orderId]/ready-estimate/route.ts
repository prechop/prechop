import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { reviseReadyEstimate } from "@/server/services/buyerOrders";
import { reviseReadyEstimateBodySchema } from "@/server/validators/buyerOrders/validate";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/vendor/orders/[orderId]/ready-estimate" },
	withAuth(async ({ req, auth, context }) => {
		try {
			assertVendor(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const parsed = reviseReadyEstimateBodySchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const result = await reviseReadyEstimate({
				vendorUserId: auth.userId,
				orderId,
				revisedPrepMin: parsed.data.revisedPrepMin,
			});
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	}),
);
