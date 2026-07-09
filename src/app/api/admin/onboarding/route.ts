import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listOnboardingQueue } from "@/server/services/admin";
import { onboardingQueueQuerySchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/onboarding" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "onboarding:read");
			const url = new URL(req.url);
			const parsed = onboardingQueueQuerySchema.safeParse(
				Object.fromEntries(url.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const queue = await listOnboardingQueue({
				campusId: parsed.data.campusId,
			});
			return ok(queue);
		} catch (error) {
			return handleError(error);
		}
	}),
);
