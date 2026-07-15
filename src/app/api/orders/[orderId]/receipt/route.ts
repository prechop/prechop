import { handleError, withApiHandler, withAuth } from "@/server/lib";
import {
	getOrderById,
	getReceiptDownloadUrl,
} from "@/server/services/buyerOrders";

export const runtime = "nodejs";

/**
 * GET /api/orders/{orderId}/receipt — 302 to a freshly-signed, short-lived S3
 * URL for the order's receipt PDF.
 *
 * A redirect rather than a URL in JSON, deliberately. A pre-signed URL is a
 * bearer credential: anyone holding it can read the receipt, no auth required.
 * Embedding a long-lived one in the order payload would spray that credential
 * through every cache, log and client store that ever touched an order, and it
 * would expire invisibly. Signing per request means the credential is minted
 * only for a caller who just proved they may see this order, and dies minutes
 * later.
 *
 * `getOrderById` is the authorisation boundary — it admits only the owning buyer
 * or the owning vendor and throws otherwise, so the receipt inherits exactly the
 * order's own access rules instead of inventing weaker ones.
 */
export const GET = withApiHandler(
	{ route: "/api/orders/[orderId]/receipt" },
	withAuth(async ({ auth, context }) => {
		try {
			const { orderId } = await (
				context as { params: Promise<{ orderId: string }> }
			).params;
			const order = await getOrderById({ userId: auth.userId, orderId });
			const url = await getReceiptDownloadUrl({ orderId, order });
			return new Response(null, {
				status: 302,
				headers: {
					location: url,
					// The signed URL is per-caller and short-lived — it must never
					// be cached by a CDN or shared proxy and handed to someone else.
					"cache-control": "private, no-store",
				},
			});
		} catch (error) {
			return handleError(error);
		}
	}),
);
