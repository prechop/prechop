import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getUserIam } from "@/server/services/iam";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/iam/users/[id]" },
	withAuth(async ({ auth, context }) => {
		try {
			requirePermission(auth, "iam:user:read");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			return ok(await getUserIam(id));
		} catch (error) {
			return handleError(error);
		}
	}),
);
