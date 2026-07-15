import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { presignProfileImage } from "@/server/services/vendors";
import { presignSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendors/me/profile-image/presign" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = presignSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await presignProfileImage({
				userId: auth.userId,
				mimeType: parsed.data.mimeType,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
