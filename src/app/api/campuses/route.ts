import { handleError, ok, withApiHandler } from "@/server/lib";
import { listActiveCampuses } from "@/server/services/campus";

export const runtime = "nodejs";

export const GET = withApiHandler({ route: "/api/campuses" }, async () => {
	try {
		return ok(await listActiveCampuses());
	} catch (e) {
		return handleError(e);
	}
});
