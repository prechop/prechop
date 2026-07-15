import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { requestPhoneChangeOtp } from "@/server/services/users";
import { requestOtpBodySchema } from "@/server/validators/auth/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/users/me/phone/request" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = requestOtpBodySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await requestPhoneChangeOtp({
					userId: auth.userId,
					phone: parsed.data.phone,
				}),
			);
		} catch (e) {
			return handleError(e);
		}
	}),
);
