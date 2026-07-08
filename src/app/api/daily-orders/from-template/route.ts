import { ErrInvalidFields } from "@/server/constants";
import {
	assertVendor,
	created,
	handleError,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { createDailyOrderFromTemplate } from "@/server/services/dailyOrders";
import { createFromTemplateSchema } from "@/server/validators/dailyOrders/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/daily-orders/from-template" },
	withAuth(async ({ req, auth }) => {
		try {
			assertVendor(auth);
			const parsed = createFromTemplateSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			return created(
				await createDailyOrderFromTemplate({
					userId: auth.userId,
					input: parsed.data,
				}),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
