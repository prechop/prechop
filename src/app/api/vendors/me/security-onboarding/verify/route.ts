import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { verifyVendorSecurityPinForSensitiveAction } from "@/server/services/vendors";
import { securityPinVerificationSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendors/me/security-onboarding/verify" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = securityPinVerificationSchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			await verifyVendorSecurityPinForSensitiveAction({
				userId: auth.userId,
				pin: parsed.data.pin,
			});
			return ok({ verified: true });
		} catch (error) {
			return handleError(error);
		}
	}),
);
