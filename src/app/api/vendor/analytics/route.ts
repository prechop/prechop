import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getVendorAnalytics } from "@/server/services/analytics";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendor/analytics" },
	withAuth(async ({ auth }) => {
		try {
			assertVendor(auth);
			return ok(await getVendorAnalytics({ userId: auth.userId }));
		} catch (e) {
			return handleError(e);
		}
	}),
);
