import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { confirmProfileImage } from "@/server/services/vendors";
import { confirmImageSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendors/me/profile-image/confirm" },
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const parsed = confirmImageSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await confirmProfileImage({
				userId: auth.userId,
				imageUrl: parsed.data.imageUrl,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
