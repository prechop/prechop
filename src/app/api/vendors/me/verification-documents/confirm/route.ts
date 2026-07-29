import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { confirmVendorVerificationDocument } from "@/server/services/vendors";
import { confirmVerificationDocumentSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendors/me/verification-documents/confirm" },
	withAuth(async ({ req, auth }) => {
		try {
			const parsed = confirmVerificationDocumentSchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const result = await confirmVendorVerificationDocument({
				userId: auth.userId,
				...parsed.data,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
