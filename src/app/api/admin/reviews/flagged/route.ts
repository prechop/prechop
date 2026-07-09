import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listFlaggedReviews } from "@/server/services/admin";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/reviews/flagged" },
	withAuth(async ({ auth }) => {
		try {
			requirePermission(auth, "review:read");
			const reviews = await listFlaggedReviews();
			return ok(reviews);
		} catch (error) {
			return handleError(error);
		}
	}),
);
