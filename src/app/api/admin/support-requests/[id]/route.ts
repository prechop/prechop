import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { updateAdminSupportRequest } from "@/server/services/supportRequests";
import { updateSupportRequestSchema } from "@/server/validators/supportRequests/validate";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/admin/support-requests/[id]" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "support:update");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const parsed = updateSupportRequestSchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await updateAdminSupportRequest({
					requestId: id,
					status: parsed.data.status,
					assignedAdminId:
						parsed.data.assignedAdminId === "me"
							? auth.userId
							: parsed.data.assignedAdminId,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
