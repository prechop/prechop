import { handleError, ok, withApiHandler } from "@/server/lib";
import { getVapidPublicKey } from "@/server/services/push";

export const runtime = "nodejs";

export const GET = withApiHandler({ route: "/api/push/vapid" }, async () => {
	try {
		return ok(getVapidPublicKey());
	} catch (e) {
		return handleError(e);
	}
});
