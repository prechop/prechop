import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { deleteReview } from "@/server/services/admin";

export const runtime = "nodejs";

export const DELETE = withApiHandler(
	{ route: "/api/admin/reviews/[id]" },
	withAuth(async ({ auth, context }) => {
		try {
			requirePermission(auth, "review:moderate");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const review = await deleteReview(id);
			return ok(review, "Review deleted");
		} catch (error) {
			return handleError(error);
		}
	}),
);
