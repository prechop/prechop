import {
	auditRoleLabel,
	getClientIp,
	getUserAgent,
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { reactivateVendor } from "@/server/services/admin";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/admin/vendors/[id]/reactivate" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "vendor:reactivate");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const vendor = await reactivateVendor({
				id,
				actor: {
					userId: auth.userId,
					role: auditRoleLabel(auth),
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return ok(vendor, "Vendor reactivated");
		} catch (error) {
			return handleError(error);
		}
	}),
);
