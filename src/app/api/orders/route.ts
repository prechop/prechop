import { ErrInvalidFields } from "@/server/constants";
import {
	assertBuyer,
	created,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getMyOrders, placeOrder } from "@/server/services/buyerOrders";
import {
	ordersQuerySchema,
	placeOrderBodySchema,
} from "@/server/validators/buyerOrders/validate";

export const runtime = "nodejs";

// Place an order — tighter rate limit than default (payment init on each call).
export const POST = withApiHandler(
	{ route: "/api/orders", rateLimit: { windowMs: 60_000, maxRequests: 5 } },
	withAuth(async ({ req, auth }) => {
		try {
			assertBuyer(auth);
			const parsed = placeOrderBodySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await placeOrder({
				buyerId: auth.userId,
				campusId: auth.campusId,
				input: parsed.data,
			});
			return created(result, "Order created");
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const GET = withApiHandler(
	{ route: "/api/orders" },
	withAuth(async ({ req, auth }) => {
		try {
			assertBuyer(auth);
			const url = new URL(req.url);
			const parsed = ordersQuerySchema.safeParse(
				Object.fromEntries(url.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const items = await getMyOrders({
				buyerId: auth.userId,
				limit: parsed.data.limit,
				offset: parsed.data.offset,
			});
			return ok(items);
		} catch (error) {
			return handleError(error);
		}
	}),
);
