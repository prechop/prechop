import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listAudit } from "@/server/services/admin";
import { auditQuerySchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/audit" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "audit:read");
			const url = new URL(req.url);
			const parsed = auditQuerySchema.safeParse(
				Object.fromEntries(url.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const logs = await listAudit({
				limit: parsed.data.limit,
				offset: parsed.data.offset,
			});
			return ok(logs);
		} catch (error) {
			return handleError(error);
		}
	}),
);
