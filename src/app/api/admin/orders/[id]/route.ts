import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getOrder } from "@/server/services/admin";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/orders/[id]" },
	withAuth(async ({ auth, context }) => {
		try {
			requirePermission(auth, "order:read");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const order = await getOrder(id);
			return ok(order);
		} catch (error) {
			return handleError(error);
		}
	}),
);
