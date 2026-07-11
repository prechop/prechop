import { handleError, ok, withApiHandler } from "@/server/lib";
import { getVendorStorefront } from "@/server/services/dailyOrders";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/[vendorId]/storefront" },
	async ({ context }) => {
		try {
			const { vendorId } = await (
				context as { params: Promise<{ vendorId: string }> }
			).params;
			return ok(await getVendorStorefront({ vendorId }));
		} catch (error) {
			return handleError(error);
		}
	},
);
