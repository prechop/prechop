import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { markAllNotificationsRead } from "@/server/services/notifications";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/notifications/read-all" },
	withAuth(async ({ auth }) => {
		try {
			return ok(await markAllNotificationsRead({ userId: auth.userId }));
		} catch (e) {
			return handleError(e);
		}
	}),
);
