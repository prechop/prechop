import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { updateVendorLocation } from "@/server/services/vendors";
import { locationSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendors/me/location" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = locationSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await updateVendorLocation({
				userId: auth.userId,
				input: parsed.data,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
