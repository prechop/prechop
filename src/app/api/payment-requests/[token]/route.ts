import { handleError, ok, withApiHandler } from "@/server/lib";
import { getExternalPaymentRequest } from "@/server/services/payments";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/payment-requests/[token]" },
	async ({ context }) => {
		try {
			const { token } = await (
				context as { params: Promise<{ token: string }> }
			).params;
			return ok(await getExternalPaymentRequest(token));
		} catch (error) {
			return handleError(error);
		}
	},
);
