import { ErrInvalidFields } from "@/server/constants";
import {
	assertAdmin,
	getClientIp,
	getUserAgent,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { suspendVendor } from "@/server/services/admin";
import { suspendVendorSchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/admin/vendors/[id]/suspend" },
	withAuth(async ({ req, auth, context }) => {
		try {
			assertAdmin(auth);
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const parsed = suspendVendorSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const vendor = await suspendVendor({
				id,
				reason: parsed.data.reason,
				actor: {
					userId: auth.userId,
					role: auth.role,
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return ok(vendor, "Vendor suspended");
		} catch (error) {
			return handleError(error);
		}
	}),
);
