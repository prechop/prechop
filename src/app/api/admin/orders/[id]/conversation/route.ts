import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { readOrderConversation } from "@/server/services/orderConversations";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/orders/[id]/conversation" },
	withAuth(async ({ auth, context }) => {
		try {
			requirePermission(auth, "support:read");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			return ok(
				await readOrderConversation({
					auth,
					orderId: id,
					adminRead: true,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
