import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listVendors } from "@/server/services/admin";
import { vendorsQuerySchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/vendors" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "vendor:read");
			const url = new URL(req.url);
			const parsed = vendorsQuerySchema.safeParse(
				Object.fromEntries(url.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const vendors = await listVendors({
				campusId: parsed.data.campusId,
				status: parsed.data.status,
			});
			return ok(vendors);
		} catch (error) {
			return handleError(error);
		}
	}),
);
