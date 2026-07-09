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
import { approveVendor } from "@/server/services/admin";
import { approveVendorSchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/admin/onboarding/[id]/approve" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "onboarding:approve");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const body = await req.json().catch(() => ({}));
			const parsed = approveVendorSchema.safeParse(body ?? {});
			if (!parsed.success) throw ErrInvalidFields;
			const vendor = await approveVendor({
				id,
				notes: parsed.data.notes,
				actor: {
					userId: auth.userId,
					role: auditRoleLabel(auth),
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return ok(vendor, "Vendor approved");
		} catch (error) {
			return handleError(error);
		}
	}),
);
