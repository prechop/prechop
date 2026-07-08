import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { getMe } from "@/server/services/users";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/auth/me" },
	withAuth(async ({ auth }) => {
		try {
			return ok(await getMe({ userId: auth.userId }));
		} catch (e) {
			return handleError(e);
		}
	}),
);
