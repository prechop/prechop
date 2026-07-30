import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { listMyOrderConversations } from "@/server/services/orderConversations";
import { listOrderConversationsQuerySchema } from "@/server/validators/orderConversations/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/order-conversations" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = listOrderConversationsQuerySchema.safeParse(
				Object.fromEntries(req.nextUrl.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await listMyOrderConversations({
					auth,
					limit: parsed.data.limit,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
