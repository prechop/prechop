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
import { revealAdminHandoverPin } from "@/server/services/buyerOrders";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/admin/orders/[id]/handover/reveal-pin" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "order:handover:reveal");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			return ok(
				await revealAdminHandoverPin({
					orderId: id,
					actor: {
						userId: auth.userId,
						role: auditRoleLabel(auth),
						ip: getClientIp(req),
						userAgent: getUserAgent(req),
					},
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
