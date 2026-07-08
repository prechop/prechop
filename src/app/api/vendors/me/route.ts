import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getMyVendorProfile } from "@/server/services/vendors";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/me" },
	withAuth(async ({ auth }) => {
		try {
			assertVendor(auth);
			const vendor = await getMyVendorProfile({ userId: auth.userId });
			return ok(vendor);
		} catch (e) {
			return handleError(e);
		}
	}),
);
