import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getMyDailyOrders } from "@/server/services/dailyOrders";
import { myDailyOrdersQuerySchema } from "@/server/validators/dailyOrders/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/daily-orders/my-orders" },
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const url = new URL(req.url);
			const parsed = myDailyOrdersQuerySchema.safeParse(
				Object.fromEntries(url.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await getMyDailyOrders({ userId: auth.userId, ...parsed.data }),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
