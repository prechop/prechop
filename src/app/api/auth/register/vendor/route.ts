import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler } from "@/server/lib";
import { registerVendor } from "@/server/services/auth";
import { registerVendorBodySchema } from "@/server/validators/auth/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/auth/register/vendor",
		rateLimit: { windowMs: 60_000, maxRequests: 10 },
	},
	async ({ req }) => {
		try {
			const parsed = registerVendorBodySchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await registerVendor(parsed.data);
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	},
);
