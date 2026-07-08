import { handleError, ok, withApiHandler } from "@/server/lib";
import { handlePaystackWebhook } from "@/server/services/payments";

export const runtime = "nodejs";

// Paystack webhook: non-browser caller, so CSRF Origin/Referer checks are
// disabled. Authenticity is proven by the HMAC-SHA512 signature instead.
export const POST = withApiHandler(
	{
		route: "/api/webhook/paystack",
		csrf: false,
		rateLimit: { windowMs: 60_000, maxRequests: 50 },
	},
	async ({ req }) => {
		try {
			// Raw body is required for signature verification — do not parse.
			const rawBody = await req.text();
			const signature =
				req.headers.get("x-paystack-signature") ?? undefined;
			const result = await handlePaystackWebhook({ rawBody, signature });
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	},
);
