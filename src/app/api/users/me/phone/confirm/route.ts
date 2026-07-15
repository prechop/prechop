import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { confirmPhoneChange } from "@/server/services/users";
import { verifyOtpBodySchema } from "@/server/validators/auth/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/users/me/phone/confirm" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = verifyOtpBodySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await confirmPhoneChange({
					userId: auth.userId,
					phone: parsed.data.phone,
					otp: parsed.data.otp,
				}),
			);
		} catch (e) {
			return handleError(e);
		}
	}),
);
