import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { setMenuItemAvailability } from "@/server/services/menu";
import { availabilitySchema } from "@/server/validators/menu/validate";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/menu/[itemId]/availability" },
	withAuth(async ({ req, auth, context }) => {
		try {
			assertVendor(auth);
			const { itemId } = await (
				context as { params: Promise<{ itemId: string }> }
			).params;
			const parsed = availabilitySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const item = await setMenuItemAvailability({
				userId: auth.userId,
				itemId,
				isAvailable: parsed.data.isAvailable,
			});
			return ok(item);
		} catch (e) {
			return handleError(e);
		}
	}),
);
