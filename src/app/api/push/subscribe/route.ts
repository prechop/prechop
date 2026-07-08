import { created, handleError, withApiHandler, withAuth } from "@/server/lib";
import { subscribePush } from "@/server/services/push";
import { parseSubscribePush } from "@/server/validators/push/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/push/subscribe" },
	withAuth(async ({ req, auth }) => {
		try {
			const body = parseSubscribePush(await req.json());
			return created(
				await subscribePush({
					userId: auth.userId,
					endpoint: body.endpoint,
					keys: body.keys,
					userAgent: body.userAgent,
				}),
			);
		} catch (e) {
			return handleError(e);
		}
	}),
);
