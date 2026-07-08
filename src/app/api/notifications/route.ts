import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { listNotifications } from "@/server/services/notifications";
import { parseListNotificationsQuery } from "@/server/validators/notifications/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/notifications" },
	withAuth(async ({ req, auth }) => {
		try {
			const params = Object.fromEntries(new URL(req.url).searchParams);
			const query = parseListNotificationsQuery(params);
			return ok(
				await listNotifications({
					userId: auth.userId,
					limit: query.limit,
					offset: query.offset,
				}),
			);
		} catch (e) {
			return handleError(e);
		}
	}),
);
