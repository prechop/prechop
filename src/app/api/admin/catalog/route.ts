import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listCatalog } from "@/server/services/admin";
import { catalogQuerySchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/catalog" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "menu:read");
			const url = new URL(req.url);
			const parsed = catalogQuerySchema.safeParse(
				Object.fromEntries(url.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(await listCatalog(parsed.data));
		} catch (error) {
			return handleError(error);
		}
	}),
);
