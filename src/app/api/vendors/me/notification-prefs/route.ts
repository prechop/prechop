import { ErrInvalidFields } from "@/server/constants";
import {
	assertActiveVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { updateNotificationPrefs } from "@/server/services/vendors";
import { notificationPrefsSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendors/me/notification-prefs" },
	withAuth(async ({ req, auth }) => {
		try {
			await assertActiveVendor(auth);
			const parsed = notificationPrefsSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await updateNotificationPrefs({
				userId: auth.userId,
				prefs: parsed.data,
			});
			return ok(result, "Notification preferences saved");
		} catch (e) {
			return handleError(e);
		}
	}),
);
