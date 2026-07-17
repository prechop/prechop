import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listAdminSupportRequests } from "@/server/services/supportRequests";
import { supportStatusSchema } from "@/server/validators/supportRequests/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/support-requests" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "support:read");
			const url = new URL(req.url);
			const parsed = supportStatusSchema.safeParse(
				url.searchParams.get("status") ?? undefined,
			);
			return ok(
				await listAdminSupportRequests({
					status: parsed.success ? parsed.data : undefined,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
