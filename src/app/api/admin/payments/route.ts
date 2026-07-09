import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listAdminPayments } from "@/server/services/admin";
import { paymentsQuerySchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/payments" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "payment:read");
			const url = new URL(req.url);
			const parsed = paymentsQuerySchema.safeParse(
				Object.fromEntries(url.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(await listAdminPayments(parsed.data));
		} catch (error) {
			return handleError(error);
		}
	}),
);
