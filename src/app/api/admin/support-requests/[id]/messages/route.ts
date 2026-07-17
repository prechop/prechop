import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { addAdminSupportMessage } from "@/server/services/supportRequests";
import { addSupportMessageSchema } from "@/server/validators/supportRequests/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/admin/support-requests/[id]/messages" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "support:reply");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const parsed = addSupportMessageSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await addAdminSupportMessage({
					adminUserId: auth.userId,
					requestId: id,
					message: parsed.data.message,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
