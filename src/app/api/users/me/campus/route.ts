import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { updateCampus } from "@/server/services/users";
import { parseUpdateCampus } from "@/server/validators/users/validate";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/users/me/campus" },
	withAuth(async ({ req, auth }) => {
		try {
			const body = parseUpdateCampus(await req.json());
			return ok(
				await updateCampus({
					userId: auth.userId,
					campusId: body.campusId,
				}),
			);
		} catch (e) {
			return handleError(e);
		}
	}),
);
