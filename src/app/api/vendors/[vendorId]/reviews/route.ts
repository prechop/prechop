import { handleError, ok, withApiHandler } from "@/server/lib";
import { getVendorReviews } from "@/server/services/vendors";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/[vendorId]/reviews" },
	async ({ context }) => {
		try {
			const { vendorId } = await (
				context as { params: Promise<{ vendorId: string }> }
			).params;
			const result = await getVendorReviews({ vendorId });
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	},
);
