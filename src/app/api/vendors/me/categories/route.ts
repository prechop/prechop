import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { setCategories } from "@/server/services/vendors";
import { setCategoriesSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendors/me/categories" },
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const parsed = setCategoriesSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await setCategories({
				userId: auth.userId,
				categories: parsed.data.categories,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
