import { AppError } from "@/server/constants";
import {
	handleError,
	ok,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import {
	followVendor,
	unfollowVendor,
	isBuyerFollowingVendor,
} from "@/server/services/vendorFollowers";
import { getVendorProfileByUserIdDB } from "@/server/models/vendorProfiles";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/vendors/[vendorId]/follow" },
	withAuth(async ({ auth, context }) => {
		try {
			const { vendorId } = await (
				context as { params: Promise<{ vendorId: string }> }
			).params;
			const followed = await isBuyerFollowingVendor({
				buyerId: auth.userId,
				vendorId,
			});
			return ok({ followed });
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const POST = withApiHandler(
	{ route: "/api/vendors/[vendorId]/follow" },
	withAuth(async ({ auth, context }) => {
		try {
			const { vendorId } = await (
				context as { params: Promise<{ vendorId: string }> }
			).params;
			const myVendor = await getVendorProfileByUserIdDB({
				userId: auth.userId,
			});
			if (myVendor && myVendor._id.toString() === vendorId) {
				throw new AppError(
					"You cannot follow your own kitchen.",
					403,
					"CANNOT_FOLLOW_SELF",
				);
			}
			const result = await followVendor({
				buyerId: auth.userId,
				vendorId,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);

export const DELETE = withApiHandler(
	{ route: "/api/vendors/[vendorId]/follow" },
	withAuth(async ({ auth, context }) => {
		try {
			const { vendorId } = await (
				context as { params: Promise<{ vendorId: string }> }
			).params;
			const result = await unfollowVendor({
				buyerId: auth.userId,
				vendorId,
			});
			return ok(result);
		} catch (e) {
			return handleError(e);
		}
	}),
);
