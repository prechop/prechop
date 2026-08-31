import { ErrInvalidFields, ErrResourceNotFound } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	deleteDeliveryWindow,
	getDeliveryWindowForVendor,
	updateDeliveryWindow,
} from "@/server/services/deliveryWindows";
import { updateDeliveryWindowSchema } from "@/server/validators/deliveryWindows/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/delivery-windows/[id]" },
	withAuth(async ({ auth, context }) => {
		try {
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			assertVendor(auth);
			const window = await getDeliveryWindowForVendor({
				id,
				userId: auth.userId,
			});
			return ok(window);
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const PATCH = withApiHandler(
	{ route: "/api/delivery-windows/[id]" },
	withAuth(async ({ req, auth, context }) => {
		try {
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			assertVendor(auth);
			const parsed = updateDeliveryWindowSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const window = await updateDeliveryWindow({
				userId: auth.userId,
				id,
				...parsed.data,
			});
			return ok(window);
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const DELETE = withApiHandler(
	{ route: "/api/delivery-windows/[id]" },
	withAuth(async ({ auth, context }) => {
		try {
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			assertVendor(auth);
			await deleteDeliveryWindow({
				userId: auth.userId,
				id,
			});
			return ok(true);
		} catch (error) {
			return handleError(error);
		}
	}),
);
