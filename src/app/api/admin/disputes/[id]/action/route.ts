import { ErrInvalidFields } from "@/server/constants";
import {
	auditRoleLabel,
	getClientIp,
	getUserAgent,
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	permissionForDisputeAction,
	reviewOrderDisputeAsAdmin,
} from "@/server/services/admin";
import { reviewOrderDisputeSchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/admin/disputes/[id]/action" },
	withAuth(async ({ req, auth, context }) => {
		try {
			const parsed = reviewOrderDisputeSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			requirePermission(
				auth,
				permissionForDisputeAction(parsed.data.action),
			);
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const dispute = await reviewOrderDisputeAsAdmin({
				disputeId: id,
				action: parsed.data.action,
				note: parsed.data.note,
				amountKobo: parsed.data.amountKobo,
				actor: {
					userId: auth.userId,
					role: auditRoleLabel(auth),
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return ok(dispute);
		} catch (error) {
			return handleError(error);
		}
	}),
);
