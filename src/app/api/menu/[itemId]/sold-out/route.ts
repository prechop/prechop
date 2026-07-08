import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { setMenuItemSoldOut } from "@/server/services/menu";
import { soldOutSchema } from "@/server/validators/menu/validate";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/menu/[itemId]/sold-out" },
	withAuth(async ({ req, auth, context }) => {
		try {
			assertVendor(auth);
			const { itemId } = await (
				context as { params: Promise<{ itemId: string }> }
			).params;
			const parsed = soldOutSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const item = await setMenuItemSoldOut({
				userId: auth.userId,
				itemId,
				isSoldOut: parsed.data.isSoldOut,
			});
			return ok(item);
		} catch (e) {
			return handleError(e);
		}
	}),
);
