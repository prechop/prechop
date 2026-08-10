import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getAdminSupportOrderContext } from "@/server/services/supportRequests";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/support-requests/[id]/order" },
	withAuth(async ({ auth, context }) => {
		try {
			requirePermission(auth, "support:read");
			requirePermission(auth, "order:read");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			return ok(await getAdminSupportOrderContext({ requestId: id }));
		} catch (error) {
			return handleError(error);
		}
	}),
);
