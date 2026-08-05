import { ErrPinResetOtpExpired, ErrPinResetOtpInvalid, ErrPinResetSupportRequired, ErrPinResetUnauthorized } from "@/server/constants";
import {
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { consumePinResetAuthorization } from "@/server/services/vendors/forgotPin";
import { resolveVendorByUserId, vendorIdOf } from "@/server/services/vendors/resolveVendor";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendors/me/security/forgot-pin/authorize" },
	withAuth(async ({ req, auth }) => {
		try {
			const body = await req.json();
			const token = body.token as string | undefined;
			if (!token || typeof token !== "string") {
				throw ErrPinResetSupportRequired;
			}

			const vendor = await resolveVendorByUserId({ userId: auth.userId });
			const vendorId = vendorIdOf(vendor);

			const result = await consumePinResetAuthorization({
				vendorId,
				token,
				ip:
					(req as { ip?: string }).ip ??
					req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
					undefined,
				userAgent: req.headers.get("user-agent") ?? undefined,
			});

			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	}),
);
