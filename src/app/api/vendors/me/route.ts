import { AppError, VENDORS_GROUP } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { addUserToGroupDB } from "@/server/models";
import { getBuiltInGroupId } from "@/server/services/iam";
import { getMyVendorProfile } from "@/server/services/vendors";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/me" },
	withAuth(async ({ auth }) => {
		try {
			const vendor = await getMyVendorProfile({ userId: auth.userId });

			if (!vendor) {
				throw new AppError(
					"This account does not have a vendor profile.",
					404,
					"VENDOR_PROFILE_NOT_FOUND",
				);
			}

			const vendorsGroupId = await getBuiltInGroupId(VENDORS_GROUP);
			if (vendorsGroupId && !auth.groups.includes(VENDORS_GROUP)) {
				await addUserToGroupDB({
					id: auth.userId,
					groupId: vendorsGroupId,
				});
			}

			return ok(vendor);
		} catch (e) {
			return handleError(e);
		}
	}),
);
