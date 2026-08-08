import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { getBuyerFollowedVendorIds } from "@/server/services/vendorFollowers";
import { listDailyOrdersByVendorDB, DailyOrderStatus } from "@/server/models";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/buyers/me/feed" },
	withAuth(async ({ auth }) => {
		try {
			const followedVendorIds = await getBuyerFollowedVendorIds({
				buyerId: auth.userId,
			});

			if (followedVendorIds.length === 0) {
				return ok({ items: [] });
			}

			const now = new Date();
			const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

			const orders = await Promise.all(
				followedVendorIds.map((vendorId) =>
					listDailyOrdersByVendorDB({
						vendorId,
						limit: 10,
						from: since,
					}),
				),
			);

			const flat = orders.flat();
			const items = flat
				.filter((o) => o.isPublic && o.status === DailyOrderStatus.ACTIVE)
				.map((o) => ({
					id: o._id.toString(),
					type: "new_menu" as const,
					vendorId: o.vendorId.toString(),
					title: o.title,
					createdAt: o.createdAt,
					scheduledDate: o.scheduledDate,
					cutoffTime: o.cutoffTime,
				}))
				.sort(
					(a, b) =>
						new Date(b.createdAt).getTime() -
						new Date(a.createdAt).getTime(),
				);

			return ok({ items });
		} catch (e) {
			return handleError(e);
		}
	}),
);
