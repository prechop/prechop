import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	createFulfillmentLocationDB,
	listFulfillmentLocationsDB,
} from "@/server/models";
import { createFulfillmentLocationSchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/fulfillment-locations" },
	withAuth(async ({ auth }) => {
		try {
			requirePermission(auth, "siteConfig:read");
			const locations = await listFulfillmentLocationsDB();
			return ok(locations);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const POST = withApiHandler(
	{ route: "/api/admin/fulfillment-locations" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "siteConfig:update");
			const parsed = createFulfillmentLocationSchema.safeParse(
				await req.json(),
			);
			if (!parsed.success) throw ErrInvalidFields;
			const location = await createFulfillmentLocationDB({
				payload: parsed.data,
			});
			return ok(location);
		} catch (e) {
			return handleError(e);
		}
	}),
);
