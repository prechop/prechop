import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	BrandKitFulfillmentStatus,
	getVendorProfileByIdDB,
	updateVendorProfileDB,
} from "@/server/models";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/vendors/[id]/brand-kit" },
	withAuth(async ({ auth, context }) => {
		try {
			requirePermission(auth, "vendor:read");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const vendor = await getVendorProfileByIdDB({ id });
			if (!vendor) {
				return handleError(new Error("Vendor not found"));
			}
			return ok({
				payment: {
					status: vendor.brandKitPaymentStatus,
					paidAt: vendor.brandKitPaidAt,
				},
				fulfillment: {
					status: vendor.brandKitFulfillmentStatus,
					locationId: vendor.brandKitFulfillmentLocationId,
					receivedAt: vendor.brandKitReceivedAt,
				},
			});
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const PATCH = withApiHandler(
	{ route: "/api/admin/vendors/[id]/brand-kit" },
	withAuth(async ({ req, auth, context }) => {
		try {
			requirePermission(auth, "vendor:update");
			const { id } = await (
				context as { params: Promise<{ id: string }> }
			).params;
			const body = await req.json();
			const { status, locationId } = body as {
				status?: BrandKitFulfillmentStatus;
				locationId?: string;
			};

			if (
				!status ||
				!Object.values(BrandKitFulfillmentStatus).includes(status)
			) {
				return handleError(new Error("Invalid fulfillment status"));
			}

			const vendor = await getVendorProfileByIdDB({ id });
			if (!vendor) {
				return handleError(new Error("Vendor not found"));
			}

			const payload: Record<string, unknown> = {
				brandKitFulfillmentStatus: status,
			};
			if (locationId !== undefined) {
				payload.brandKitFulfillmentLocationId = locationId;
			}
			if (status === BrandKitFulfillmentStatus.RECEIVED) {
				payload.brandKitReceivedAt = new Date();
			}

			await updateVendorProfileDB({
				id: vendor._id.toString(),
				payload,
			});

			return ok({
				status,
				locationId,
				receivedAt:
					status === BrandKitFulfillmentStatus.RECEIVED
						? payload.brandKitReceivedAt
						: vendor.brandKitReceivedAt,
			});
		} catch (error) {
			return handleError(error);
		}
	}),
);
