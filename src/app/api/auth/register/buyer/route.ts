import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler } from "@/server/lib";
import { registerBuyer } from "@/server/services/auth";
import { registerBuyerBodySchema } from "@/server/validators/auth/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/auth/register/buyer",
		rateLimit: { windowMs: 60_000, maxRequests: 10 },
	},
	async ({ req }) => {
		try {
			const parsed = registerBuyerBodySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await registerBuyer(parsed.data);
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	},
);
