import { ErrInvalidFields } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listVendorsDB, VendorStatus } from "@/server/models";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/vendors/active" },
	withAuth(async ({ auth }) => {
		try {
			requirePermission(auth, "vendor:read");
			const vendors = await listVendorsDB({
				status: VendorStatus.ACTIVE,
				limit: 200,
			});
			return ok(
				vendors.map((v) => ({
					id: v._id.toString(),
					businessName: v.businessName,
					profileImageUrl: v.profileImageUrl,
					isOpenForOrders: v.isOpenForOrders,
				})),
			);
		} catch (error) {
			return handleError(error);
		}
	}),
);
