import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { updateBusinessIdentity } from "@/server/services/vendors";
import { businessIdentitySchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendors/me/business-identity" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = businessIdentitySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await updateBusinessIdentity({
				userId: auth.userId,
				...parsed.data,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
