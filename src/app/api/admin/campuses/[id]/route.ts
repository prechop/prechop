import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { updateCampus } from "@/server/services/admin";
import { updateCampusSchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/admin/campuses/[id]" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "campus:update");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const parsed = updateCampusSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const campus = await updateCampus(id, parsed.data);
			return ok(campus);
		} catch (error) {
			return handleError(error);
		}
	}),
);
