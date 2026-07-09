import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { updateDeliveryDefaults } from "@/server/services/vendors";
import { deliveryDefaultsSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendors/me/delivery-defaults" },
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const parsed = deliveryDefaultsSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await updateDeliveryDefaults({
				userId: auth.userId,
				defaults: parsed.data,
			});
			return ok(result, "Delivery defaults saved");
		} catch (e) {
			return handleError(e);
		}
	}),
);
