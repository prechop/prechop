import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	created,
	handleError,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { createDailyOrder } from "@/server/services/dailyOrders";
import { createDailyOrderSchema } from "@/server/validators/dailyOrders/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/daily-orders" },
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const parsed = createDailyOrderSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			return created(
				await createDailyOrder({
					userId: auth.userId,
					input: parsed.data,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
