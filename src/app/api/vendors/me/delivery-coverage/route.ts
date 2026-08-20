import { ErrInvalidFields } from "@/server/constants";
import {
	assertActiveVendor,
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	DeliveryCoverageType,
	getVendorDeliveryCoverage,
	updateVendorDeliveryCoverage,
} from "@/server/services/vendors/deliveryCoverage";
import { deliveryCoverageSchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/me/delivery-coverage" },
	withAuth(async ({ auth }) => {
		try {
			assertActiveVendor(auth);
			const coverage = await getVendorDeliveryCoverage({
				userId: auth.userId,
			});
			return ok(coverage);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const PATCH = withApiHandler(
	{ route: "/api/vendors/me/delivery-coverage" },
	withAuth(async ({ req, auth }) => {
		try {
			assertActiveVendor(auth);
			const parsed = deliveryCoverageSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const coverage = await updateVendorDeliveryCoverage({
				userId: auth.userId,
				deliveryCoverageType: parsed.data.deliveryCoverageType
					? (parsed.data.deliveryCoverageType as DeliveryCoverageType)
					: undefined,
				deliveryLocations: parsed.data.deliveryLocations,
			});
			return ok(coverage);
		} catch (e) {
			return handleError(e);
		}
	}),
);
