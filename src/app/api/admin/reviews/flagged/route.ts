import {
	assertAdmin,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listFlaggedReviews } from "@/server/services/admin";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/reviews/flagged" },
	withAuth(async ({ auth }) => {
		try {
			assertAdmin(auth);
			const reviews = await listFlaggedReviews();
			return ok(reviews);
		} catch (error) {
			return handleError(error);
		}
	}),
);
