import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listUsersForIam } from "@/server/services/iam";
import { usersQuerySchema } from "@/server/validators/iam/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/iam/users" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "iam:user:read");
			const url = new URL(req.url);
			const parsed = usersQuerySchema.safeParse(
				Object.fromEntries(url.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(await listUsersForIam(parsed.data));
		} catch (error) {
			return handleError(error);
		}
	}),
);
