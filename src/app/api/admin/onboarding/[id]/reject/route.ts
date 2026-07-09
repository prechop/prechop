import { ErrInvalidFields } from "@/server/constants";
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
import { rejectVendor } from "@/server/services/admin";
import { rejectVendorSchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/admin/onboarding/[id]/reject" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "onboarding:reject");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const parsed = rejectVendorSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const vendor = await rejectVendor({
				id,
				reason: parsed.data.reason,
				actor: {
					userId: auth.userId,
					role: auditRoleLabel(auth),
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return ok(vendor, "Changes requested");
		} catch (error) {
			return handleError(error);
		}
	}),
);
