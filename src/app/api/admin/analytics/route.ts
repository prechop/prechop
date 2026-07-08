import {
	assertAdmin,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getPlatformAnalytics } from "@/server/services/admin";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/analytics" },
	withAuth(async ({ auth }) => {
		try {
			assertAdmin(auth);
			const summary = await getPlatformAnalytics();
			return ok(summary);
		} catch (error) {
			return handleError(error);
		}
	}),
);
