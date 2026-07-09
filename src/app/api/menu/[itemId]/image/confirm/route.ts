import { ErrInvalidFields } from "@/server/constants";
import {
	assertActiveVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { confirmMenuItemImage } from "@/server/services/menu";
import { imageConfirmSchema } from "@/server/validators/menu/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/menu/[itemId]/image/confirm" },
	withAuth(async ({ req, auth, context }) => {
		try {
			await assertActiveVendor(auth);
			const { itemId } = await (
				context as { params: Promise<{ itemId: string }> }
			).params;
			const parsed = imageConfirmSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const item = await confirmMenuItemImage({
				userId: auth.userId,
				itemId,
				imageUrl: parsed.data.imageUrl,
			});
			return ok(item);
		} catch (e) {
			return handleError(e);
		}
	}),
);
