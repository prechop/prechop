import { ErrInvalidFields } from "@/server/constants";
import {
	assertActiveVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	getVendorFeatureSettings,
	updateVendorFeatureSettings,
} from "@/server/services/vendors/featureSettings";
import { vendorFeatureSettingsSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/me/feature-settings" },
	withAuth(async ({ auth }) => {
		try {
			assertActiveVendor(auth);
			const settings = await getVendorFeatureSettings({ userId: auth.userId });
			return ok(settings);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const PATCH = withApiHandler(
	{ route: "/api/vendors/me/feature-settings" },
	withAuth(async ({ req, auth }) => {
		try {
			assertActiveVendor(auth);
			const parsed = vendorFeatureSettingsSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const settings = await updateVendorFeatureSettings({
				userId: auth.userId,
				...parsed.data,
			});
			return ok(settings);
		} catch (e) {
			return handleError(e);
		}
	}),
);
