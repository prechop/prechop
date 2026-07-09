import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	deactivateWhatsappTv,
	updateWhatsappTv,
} from "@/server/services/admin";
import { updateWhatsappTvSchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/admin/whatsapp-tvs/[id]" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "whatsappTv:manage");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const parsed = updateWhatsappTvSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const tv = await updateWhatsappTv(id, parsed.data);
			return ok(tv);
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const DELETE = withApiHandler(
	{ route: "/api/admin/whatsapp-tvs/[id]" },
	withAuth(async ({ auth, context }) => {
		try {
			requirePermission(auth, "whatsappTv:manage");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const result = await deactivateWhatsappTv(id);
			return ok(result, "WhatsApp TV deactivated");
		} catch (error) {
			return handleError(error);
		}
	}),
);
