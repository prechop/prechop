import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getAdminHandoverVerificationDetails } from "@/server/services/buyerOrders";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/orders/[id]/handover" },
	withAuth(async ({ auth, context }) => {
		try {
			requirePermission(auth, "order:read");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			return ok(
				await getAdminHandoverVerificationDetails({ orderId: id }),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
