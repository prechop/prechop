import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler } from "@/server/lib";
import { initializeExternalPayment } from "@/server/services/payments";
import { externalPaymentInitializeSchema } from "@/server/validators/buyerOrders/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/payment-requests/[token]/initialize",
		rateLimit: { windowMs: 60_000, maxRequests: 6 },
	},
	async ({ req, context }) => {
		try {
			const { token } = await (
				context as { params: Promise<{ token: string }> }
			).params;
			const parsed = externalPaymentInitializeSchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await initializeExternalPayment({
					token,
					contact: parsed.data.contact,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	},
);
