import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listDisputes } from "@/server/services/admin";
import { disputesQuerySchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/disputes" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "support:read");
			const url = new URL(req.url);
			const parsed = disputesQuerySchema.safeParse(
				Object.fromEntries(url.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(await listDisputes(parsed.data));
		} catch (error) {
			return handleError(error);
		}
	}),
);
