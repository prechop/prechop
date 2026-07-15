import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getAdminRevenue } from "@/server/services/admin";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/revenue" },
	withAuth(async ({ auth }) => {
		try {
			requirePermission(auth, "payment:read");
			return ok(await getAdminRevenue());
		} catch (error) {
			return handleError(error);
		}
	}),
);
