import { ErrInvalidFields } from "@/server/constants";
import {
	fail,
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	createFulfillmentLocationDB,
	deleteFulfillmentLocationDB,
	getFulfillmentLocationByIdDB,
	listFulfillmentLocationsDB,
	updateFulfillmentLocationDB,
} from "@/server/models";
import {
	createFulfillmentLocationSchema,
	updateFulfillmentLocationSchema,
} from "@/server/validators/admin/validate";

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

export const PATCH = withApiHandler(
	{ route: "/api/admin/fulfillment-locations" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "siteConfig:update");
			const body = await req.json();
			const parsed = updateFulfillmentLocationSchema.safeParse(body);
			if (!parsed.success) throw ErrInvalidFields;
			const { id, ...patch } = parsed.data;
			const existing = await getFulfillmentLocationByIdDB({ id });
			if (!existing) return fail(404, "Fulfillment location not found.");
			const updated = await updateFulfillmentLocationDB({
				id,
				payload: patch,
			});
			return ok(updated);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const DELETE = withApiHandler(
	{ route: "/api/admin/fulfillment-locations" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "siteConfig:update");
			const body = await req.json();
			const { id } = body as { id?: string };
			if (!id) throw ErrInvalidFields;
			const existing = await getFulfillmentLocationByIdDB({ id });
			if (!existing) return fail(404, "Fulfillment location not found.");
			await deleteFulfillmentLocationDB({ id });
			return ok({ deleted: true });
		} catch (e) {
			return handleError(e);
		}
	}),
);
