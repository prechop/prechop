import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { unflagReview } from "@/server/services/admin";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/admin/reviews/[id]/unflag" },
	withAuth(async ({ auth, context }) => {
		try {
			requirePermission(auth, "review:moderate");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const result = await unflagReview(id);
			return ok(result, "Review unflagged");
		} catch (error) {
			return handleError(error);
		}
	}),
);
