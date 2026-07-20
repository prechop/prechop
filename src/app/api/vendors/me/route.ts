import { AppError } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { getMyVendorProfile } from "@/server/services/vendors";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/me" },
	withAuth(async ({ auth }) => {
		try {
			const vendor = await getMyVendorProfile({ userId: auth.userId });

			if (!vendor) {
				throw new AppError(
					"This account does not have a vendor profile.",
					404,
					"VENDOR_PROFILE_NOT_FOUND",
				);
			}

			return ok(vendor);
		} catch (e) {
			return handleError(e);
		}
	}),
);
