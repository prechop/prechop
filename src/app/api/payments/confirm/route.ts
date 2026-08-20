import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { confirmBuyerPaymentByReference } from "@/server/services/payments";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/payments/confirm",
		rateLimit: { windowMs: 60_000, maxRequests: 20 },
	},
	withAuth(async ({ auth, req }) => {
		try {
			const body = (await req.json().catch(() => null)) as {
				reference?: string;
			} | null;
			const reference = body?.reference?.trim();
			if (!reference) throw ErrInvalidFields;
			return ok(
				await confirmBuyerPaymentByReference({
					buyerId: auth.userId,
					reference,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
