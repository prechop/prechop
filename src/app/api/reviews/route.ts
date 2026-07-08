import { ErrInvalidFields } from "@/server/constants";
import {
	assertBuyer,
	created,
	handleError,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { createReview } from "@/server/services/reviews";
import { createReviewSchema } from "@/server/validators/reviews/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/reviews" },
	withAuth(async ({ req, auth }) => {
		try {
			assertBuyer(auth);
			const parsed = createReviewSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			return created(
				await createReview({ userId: auth.userId, input: parsed.data }),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
