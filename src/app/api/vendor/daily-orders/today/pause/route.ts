import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import {
	getVendorProfileByUserIdDB,
	getDeliveryWindowByIdDB,
	VendorStatus,
} from "@/server/models";
import {
	pauseBatchForToday,
	resumeBatchForToday,
	getTodaysBatches,
} from "@/server/services/deliveryWindows/batches";

export const runtime = "nodejs";

export const POST = withApiHandler(
	{ route: "/api/vendor/daily-orders/today/pause" },
	withAuth(async ({ req, auth }) => {
		try {
			const vendor = await getVendorProfileByUserIdDB({ userId: auth.userId });
			if (!vendor || vendor.status !== VendorStatus.ACTIVE) {
				return handleError(new Error("Forbidden"));
			}
			const vendorId = vendor._id.toString();
			const body = await req.json();
			const { windowId, action } = body as {
				windowId?: string;
				action?: "pause" | "resume";
			};

			if (!windowId || !action) {
				return handleError(new Error("windowId and action are required"));
			}

			const window = await getDeliveryWindowByIdDB({ id: windowId });
			if (!window || window.vendorId.toString() !== vendorId) {
				return handleError(new Error("Forbidden"));
			}

			if (action === "pause") {
				await pauseBatchForToday({ windowId, date: new Date() });
				return ok({ action: "pause", success: true });
			}

			if (action === "resume") {
				const resumed = await resumeBatchForToday({
					windowId,
					date: new Date(),
					orderWindowEnd: window.orderWindowEnd,
				});
				if (!resumed) {
					return handleError(
						new Error(
							"Cannot resume: order window has ended or the batch is not paused.",
						),
					);
				}
				return ok({ action: "resume", success: true });
			}

			return handleError(new Error("Invalid action"));
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const GET = withApiHandler(
	{ route: "/api/vendor/daily-orders/today/pause" },
	withAuth(async ({ auth }) => {
		try {
			const vendor = await getVendorProfileByUserIdDB({ userId: auth.userId });
			if (!vendor) {
				return handleError(new Error("Vendor not found"));
			}
			const vendorId = vendor._id.toString();
			const batches = await getTodaysBatches({ vendorId, date: new Date() });
			return ok({ batches });
		} catch (error) {
			return handleError(error);
		}
	}),
);
