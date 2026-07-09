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
import { setCatalogItemAvailability } from "@/server/services/admin";
import { catalogAvailabilitySchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/admin/catalog/[id]" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "menu:takedown");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const parsed = catalogAvailabilitySchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const item = await setCatalogItemAvailability({
				id,
				isAvailable: parsed.data.isAvailable,
				actor: {
					userId: auth.userId,
					role: auditRoleLabel(auth),
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return ok(item, "Catalog item updated");
		} catch (error) {
			return handleError(error);
		}
	}),
);
