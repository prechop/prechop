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
import { refundOrderAsAdmin } from "@/server/services/admin";
import { adminRefundOrderSchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/admin/orders/[id]/refund" },
	withAuth(async ({ req, auth, context }) => {
		try {
			// `refund:create` ("Issue a refund") already exists in the catalog and
			// is granted by the built-in FinanceManager policy — this is exactly
			// the capability it was defined for, so no new action is introduced.
			requirePermission(auth, "refund:create");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const parsed = adminRefundOrderSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await refundOrderAsAdmin({
				orderId: id,
				amountKobo: parsed.data.amountKobo,
				reason: parsed.data.reason,
				actor: {
					userId: auth.userId,
					role: auditRoleLabel(auth),
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return ok(result, result.message);
		} catch (error) {
			return handleError(error);
		}
	}),
);
