import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { markNotificationRead } from "@/server/services/notifications";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/notifications/[id]/read" },
	withAuth(async ({ auth, context }) => {
		try {
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			return ok(await markNotificationRead({ id, userId: auth.userId }));
		} catch (e) {
			return handleError(e);
		}
	}),
);
