import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { reorderMenu } from "@/server/services/menu";
import { reorderSchema } from "@/server/validators/menu/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/menu/reorder" },
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const parsed = reorderSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await reorderMenu({
				userId: auth.userId,
				items: parsed.data.items,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
