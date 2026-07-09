import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { resolveBankAccount } from "@/server/services/vendors";
import { resolveBankSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{
		route: "/api/vendors/me/bank/resolve",
		rateLimit: { windowMs: 60_000, maxRequests: 20 },
	},
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const parsed = resolveBankSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await resolveBankAccount(parsed.data);
			return ok(result, "Account resolved");
		} catch (e) {
			return handleError(e);
		}
	}),
);
