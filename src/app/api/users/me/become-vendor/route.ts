import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { becomeVendor } from "@/server/services/users";
import { becomeVendorSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/users/me/become-vendor" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = becomeVendorSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await becomeVendor({
					userId: auth.userId,
					input: parsed.data,
				}),
			);
		} catch (e) {
			return handleError(e);
		}
	}),
);
