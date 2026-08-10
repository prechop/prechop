import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { closeVendorProfile } from "@/server/services/vendors";
import { closeVendorProfileSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendors/me/close" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = closeVendorProfileSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await closeVendorProfile({
					userId: auth.userId,
					...parsed.data,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
