import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { reportReview } from "@/server/services/reviews";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/reviews/[reviewId]/report" },
	withAuth(async ({ auth, context }) => {
		try {
			assertVendor(auth);
			const { reviewId } = await (
				context as { params: Promise<{ reviewId: string }> }
			).params;
			return ok(await reportReview({ userId: auth.userId, reviewId }));
		} catch (error) {
			return handleError(error);
		}
	}),
);
