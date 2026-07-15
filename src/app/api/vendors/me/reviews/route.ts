import { ErrForbidden } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { getVendorProfileByUserIdDB } from "@/server/models";
import { getVendorReviews } from "@/server/services/vendors";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/me/reviews" },
	withAuth(async ({ auth }) => {
		try {
			const vendor = await getVendorProfileByUserIdDB({
				userId: auth.userId,
			});
			if (!vendor) throw ErrForbidden;
			return ok(
				await getVendorReviews({ vendorId: vendor._id.toString() }),
			);
		} catch (e) {
			return handleError(e);
		}
	}),
);
