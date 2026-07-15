import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { setBankDetails } from "@/server/services/vendors";
import { bankDetailsSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendors/me/bank-details" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = bankDetailsSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const result = await setBankDetails({
				userId: auth.userId,
				...parsed.data,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
