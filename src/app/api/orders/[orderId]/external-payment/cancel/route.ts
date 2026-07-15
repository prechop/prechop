import {
	assertBuyer,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { cancelExternalPaymentRequest } from "@/server/services/payments";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/orders/[orderId]/external-payment/cancel" },
	withAuth(async ({ auth, context }) => {
		try {
			assertBuyer(auth);
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			return ok(
				await cancelExternalPaymentRequest({
					buyerId: auth.userId,
					orderId,
					reason: "Buyer cancelled external payment request.",
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
