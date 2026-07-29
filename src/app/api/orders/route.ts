import { ErrInvalidFields, hash, validationError } from "@/server/constants";
import {
	ACCESS_COOKIE,
	assertBuyer,
	created,
	getClientIp,
	handleError,
	ok,
	REFRESH_COOKIE,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { getMyOrders, placeOrder } from "@/server/services/buyerOrders";
import {
	ordersQuerySchema,
	placeOrderBodySchema,
} from "@/server/validators/buyerOrders/validate";

export const runtime = "nodejs";

function cookieValue(header: string | null, name: string): string | null {
	if (!header) return null;
	const prefix = `${name}=`;
	return (
		header
			.split(";")
			.map((part) => part.trim())
			.find((part) => part.startsWith(prefix))
			?.slice(prefix.length) ?? null
	);
}

function checkoutRateLimitKey(req: Request): string {
	const cookie = req.headers.get("cookie");
	const token =
		cookieValue(cookie, ACCESS_COOKIE) ??
		cookieValue(cookie, REFRESH_COOKIE);
	if (token) return `checkout:session:${hash(token)}`;
	return `checkout:ip:${getClientIp(req)}`;
}

// Place an order — tighter rate limit than default (payment init on each call).
export const POST = withApiHandler(
	{
		route: "/api/orders",
		rateLimit: {
			windowMs: 60_000,
			maxRequests: 20,
			keyGenerator: checkoutRateLimitKey,
		},
	},
	withAuth(async ({ req, auth }) => {
		try {
			assertBuyer(auth);
			if (!auth.campusId) {
				throw validationError(
					"Choose your campus in Account before checkout.",
				);
			}
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
