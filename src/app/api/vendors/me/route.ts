import { AppError, ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import {
	getMyVendorProfile,
	updateSecurityOnboarding,
} from "@/server/services/vendors";
import { securityOnboardingSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/me" },
	withAuth(async ({ auth }) => {
		try {
			const vendor = await getMyVendorProfile({ userId: auth.userId });

			if (!vendor) {
				throw new AppError(
					"This account does not have a vendor profile.",
					404,
					"VENDOR_PROFILE_NOT_FOUND",
				);
			}

			return ok(vendor);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const PATCH = withApiHandler(
	{ route: "/api/vendors/me" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = securityOnboardingSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const vendor = await updateSecurityOnboarding({
				userId: auth.userId,
				action: parsed.data.action,
				...(parsed.data.action === "COMPLETE"
					? { pin: parsed.data.pin }
					: {}),
			});
			return ok(vendor);
		} catch (e) {
			return handleError(e);
		}
	}),
);
