import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getOnboardingSubmission } from "@/server/services/admin";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/onboarding/[id]" },
	withAuth(async ({ auth, context }) => {
		try {
			requirePermission(auth, "onboarding:read");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const submission = await getOnboardingSubmission(id);
			return ok(submission);
		} catch (error) {
			return handleError(error);
		}
	}),
);
