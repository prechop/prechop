import { handleError, ok, withApiHandler } from "@/server/lib";
import { getPublicReceipt } from "@/server/services/payments";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/receipts/[token]" },
	async ({ context }) => {
		try {
			const { token } = await (
				context as { params: Promise<{ token: string }> }
			).params;
			return ok(await getPublicReceipt(token));
		} catch (error) {
			return handleError(error);
		}
	},
);
