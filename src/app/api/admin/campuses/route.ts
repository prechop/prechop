import { ErrInvalidFields } from "@/server/constants";
import {
	created,
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { createCampus, listCampuses } from "@/server/services/admin";
import { createCampusSchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/campuses" },
	withAuth(async ({ auth }) => {
		try {
			requirePermission(auth, "campus:read");
			const campuses = await listCampuses();
			return ok(campuses);
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const POST = withApiHandler(
	{ route: "/api/admin/campuses" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "campus:create");
			const parsed = createCampusSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const campus = await createCampus(parsed.data);
			return created(campus, "Campus created");
		} catch (error) {
			return handleError(error);
		}
	}),
);
