import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { becomeVendor, startVendorApplication } from "@/server/services/users";
import {
	becomeVendorSchema,
	startVendorApplicationSchema,
} from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/users/me/become-vendor" },
	withAuth(async ({ req, auth }) => {
		try {
			const body = await req.json().catch(() => ({}));
			const startOnly = startVendorApplicationSchema.safeParse(body);
			if (startOnly.success) {
				return ok(
					await startVendorApplication({ userId: auth.userId }),
				);
			}
			const parsed = becomeVendorSchema.safeParse(body);
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
