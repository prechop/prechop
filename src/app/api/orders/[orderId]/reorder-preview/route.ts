import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { getReorderPreview } from "@/server/services/dailyOrders";

export const runtime = "nodejs";

/**
 * "Order Again" — what can this past order actually buy today, at what price?
 *
 * POST rather than GET despite being read-only: the preview is derived from
 * live listing state (prices, sold-out caps, vendor open/closed) and must never
 * be served from a CDN or browser cache. Nothing is reserved or charged.
 *
 * `withAuth` only — no `assertBuyer`. `getReorderPreview` does its own
 * per-request ownership check (order.buyerId === userId → ErrForbidden), which
 * is the authoritative check; the route never infers permission from the body.
 */
export const POST = withApiHandler(
	{ route: "/api/orders/[orderId]/reorder-preview" },
	withAuth(async ({ auth, context }) => {
		try {
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			return ok(
				await getReorderPreview({
					userId: auth.userId,
					buyerOrderId: orderId,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
