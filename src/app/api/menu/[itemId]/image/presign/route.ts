import {
	assertActiveVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { presignMenuItemImage } from "@/server/services/menu";
import {
	imagePresignSchema,
	menuValidationError,
} from "@/server/validators/menu/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/menu/[itemId]/image/presign" },
	withAuth(async ({ req, auth, context }) => {
		try {
			await assertActiveVendor(auth);
			const { itemId } = await (
				context as { params: Promise<{ itemId: string }> }
			).params;
			const parsed = imagePresignSchema.safeParse(await req.json());
			if (!parsed.success) throw menuValidationError(parsed.error);
			const result = await presignMenuItemImage({
				userId: auth.userId,
				itemId,
				mimeType: parsed.data.mimeType,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
