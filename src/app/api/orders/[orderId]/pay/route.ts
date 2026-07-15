import {
	assertBuyer,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { initializeBuyerPayment } from "@/server/services/payments";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/orders/[orderId]/pay" },
	withAuth(async ({ auth, context }) => {
		try {
			assertBuyer(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			return ok(
				await initializeBuyerPayment({ buyerId: auth.userId, orderId }),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
