import { ErrInvalidFields } from "@/server/constants";
import {
	assertAdmin,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listOrders } from "@/server/services/admin";
import { ordersQuerySchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/orders" },
	withAuth(async ({ req, auth }) => {
		try {
			assertAdmin(auth);
			const url = new URL(req.url);
			const parsed = ordersQuerySchema.safeParse(
				Object.fromEntries(url.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const orders = await listOrders({
				status: parsed.data.status,
				limit: parsed.data.limit,
				offset: parsed.data.offset,
			});
			return ok(orders);
		} catch (error) {
			return handleError(error);
		}
	}),
);
