import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { deleteMenuItem, updateMenuItem } from "@/server/services/menu";
import { updateMenuItemSchema } from "@/server/validators/menu/validate";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/menu/[itemId]" },
	withAuth(async ({ req, auth, context }) => {
		try {
			assertVendor(auth);
			const { itemId } = await (
				context as { params: Promise<{ itemId: string }> }
			).params;
			const parsed = updateMenuItemSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const item = await updateMenuItem({
				userId: auth.userId,
				itemId,
				...parsed.data,
			});
			return ok(item);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const DELETE = withApiHandler(
	{ route: "/api/menu/[itemId]" },
	withAuth(async ({ auth, context }) => {
		try {
			assertVendor(auth);
			const { itemId } = await (
				context as { params: Promise<{ itemId: string }> }
			).params;
			const result = await deleteMenuItem({
				userId: auth.userId,
				itemId,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
