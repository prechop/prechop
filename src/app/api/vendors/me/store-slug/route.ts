import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { ensureVendorStoreSlug } from "@/server/services/vendors";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendors/me/store-slug" },
	withAuth(async ({ auth }) => {
		try {
			return ok(await ensureVendorStoreSlug({ userId: auth.userId }));
		} catch (error) {
			return handleError(error);
		}
	}),
);
