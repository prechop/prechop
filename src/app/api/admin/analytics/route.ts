import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getPlatformAnalytics } from "@/server/services/admin";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/analytics" },
	withAuth(async ({ auth }) => {
		try {
			requirePermission(auth, "analytics:read");
			const summary = await getPlatformAnalytics();
			return ok(summary);
		} catch (error) {
			return handleError(error);
		}
	}),
);
