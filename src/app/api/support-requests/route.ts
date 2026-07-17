import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import {
	createSupportRequest,
	listMySupportRequests,
} from "@/server/services/supportRequests";
import { createSupportRequestSchema } from "@/server/validators/supportRequests/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/support-requests" },
	withAuth(async ({ auth }) => {
		try {
			return ok(await listMySupportRequests({ userId: auth.userId }));
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const POST = withApiHandler(
	{ route: "/api/support-requests" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = createSupportRequestSchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await createSupportRequest({ auth, payload: parsed.data }),
				"Support request sent",
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
