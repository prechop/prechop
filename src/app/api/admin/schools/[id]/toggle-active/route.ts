import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { toggleSchoolActive } from "@/server/services/admin";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/admin/schools/[id]/toggle-active" },
	withAuth(async ({ auth, context }) => {
		try {
			requirePermission(auth, "school:update");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const school = await toggleSchoolActive(id);
			return ok(school);
		} catch (error) {
			return handleError(error);
		}
	}),
);
