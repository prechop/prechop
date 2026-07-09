import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getVendor } from "@/server/services/admin";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/vendors/[id]" },
	withAuth(async ({ auth, context }) => {
		try {
			requirePermission(auth, "vendor:read");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const vendor = await getVendor(id);
			return ok(vendor);
		} catch (error) {
			return handleError(error);
		}
	}),
);
