import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { setOpenStatus } from "@/server/services/vendors";
import { openStatusSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/vendors/me/open-status" },
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const parsed = openStatusSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await setOpenStatus({
				userId: auth.userId,
				isOpenForOrders: parsed.data.isOpenForOrders,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
