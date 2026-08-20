import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { listPayoutsDB, listVendorPayablesDB } from "@/server/models";

export const runtime = "nodejs";
export const GET = withApiHandler(
	{ route: "/api/admin/finance/payouts" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "payout:read");
			const url = new URL(req.url);
			const [payouts, payables] = await Promise.all([
				listPayoutsDB({
					vendorId: url.searchParams.get("vendorId") ?? undefined,
					status: url.searchParams.get("payoutStatus") ?? undefined,
				}),
				listVendorPayablesDB({
					vendorId: url.searchParams.get("vendorId") ?? undefined,
					status: url.searchParams.get("payableStatus") ?? undefined,
				}),
			]);
			return ok({ payouts, payables });
		} catch (error) {
			return handleError(error);
		}
	}),
);
