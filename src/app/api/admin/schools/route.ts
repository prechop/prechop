import { ErrInvalidFields } from "@/server/constants";
import {
	assertAdmin,
	created,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { createSchool, listSchools } from "@/server/services/admin";
import { createSchoolSchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/schools" },
	withAuth(async ({ auth }) => {
		try {
			assertAdmin(auth);
			const schools = await listSchools();
			return ok(schools);
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const POST = withApiHandler(
	{ route: "/api/admin/schools" },
	withAuth(async ({ req, auth }) => {
		try {
			assertAdmin(auth);
			const parsed = createSchoolSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const school = await createSchool(parsed.data);
			return created(school, "School created");
		} catch (error) {
			return handleError(error);
		}
	}),
);
