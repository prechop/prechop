import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getMyDeliveryWindows, createDeliveryWindow } from "@/server/services/deliveryWindows";
import { createDeliveryWindowSchema } from "@/server/validators/deliveryWindows/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/delivery-windows" },
	withAuth(async ({ auth }) => {
		try {
			assertVendor(auth);
			const windows = await getMyDeliveryWindows({ userId: auth.userId });
			return ok(windows);
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const POST = withApiHandler(
	{ route: "/api/delivery-windows" },
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const parsed = createDeliveryWindowSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const window = await createDeliveryWindow({
				userId: auth.userId,
				...parsed.data,
			});
			return ok(window);
		} catch (error) {
			return handleError(error);
		}
	}),
);
