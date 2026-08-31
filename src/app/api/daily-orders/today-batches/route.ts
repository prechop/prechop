import { assertVendor, handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { getTodaysBatches } from "@/server/services/deliveryWindows/batches";
import { getVendorProfileByUserIdDB } from "@/server/models";
import { MealTime } from "@/server/models/enums";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/daily-orders/today-batches" },
	withAuth(async ({ auth, req }) => {
		try {
			assertVendor(auth);
			const vendor = await getVendorProfileByUserIdDB({ userId: auth.userId });
			if (!vendor) throw new Error("Vendor not found");
			const vendorId = vendor._id.toString();
		const date = new Date();
		const mealTime = new URL(req.url).searchParams.get("mealTime") as MealTime | undefined;
		const all = new URL(req.url).searchParams.get("all") === "true";
		const batches = await getTodaysBatches({ vendorId, date, mealTime, all });
			return ok({ batches });
		} catch (error) {
			return handleError(error);
		}
	}),
);
