import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { updateSecurityOnboarding } from "@/server/services/vendors";
import { securityOnboardingSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const PATCH = withApiHandler(
	{ route: "/api/vendors/me/security-onboarding" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = securityOnboardingSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await updateSecurityOnboarding({
				userId: auth.userId,
				action: parsed.data.action,
				...(parsed.data.action === "COMPLETE"
					? { pin: parsed.data.pin }
					: {}),
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
