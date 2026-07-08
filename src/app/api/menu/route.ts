import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	created,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { createMenuItem, listMenu } from "@/server/services/menu";
import { createMenuItemSchema } from "@/server/validators/menu/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/menu" },
	withAuth(async ({ auth }) => {
		try {
			assertVendor(auth);
			const items = await listMenu({ userId: auth.userId });
			return ok(items);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const POST = withApiHandler(
	{ route: "/api/menu" },
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const parsed = createMenuItemSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const item = await createMenuItem({
				userId: auth.userId,
				...parsed.data,
			});
			return created(item);
		} catch (e) {
			return handleError(e);
		}
	}),
);
