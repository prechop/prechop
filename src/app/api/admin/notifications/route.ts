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
import { broadcastNotification } from "@/server/services/admin";
import { broadcastNotificationSchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/admin/notifications",
		rateLimit: { windowMs: 60_000, maxRequests: 10 },
	},
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "notification:send");
			const parsed = broadcastNotificationSchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const result = await broadcastNotification({
				...parsed.data,
				actor: {
					userId: auth.userId,
					role: auditRoleLabel(auth),
					ip: getClientIp(req),
					userAgent: getUserAgent(req),
				},
			});
			return ok(result, `Sent to ${result.recipients} users`);
		} catch (error) {
			return handleError(error);
		}
	}),
);
