import { ErrInvalidFields } from "@/server/constants";
import { handleError, ok, withApiHandler, withAuth } from "@/server/lib";
import { getVendorEarnings } from "@/server/services/analytics";
import { earningsQuerySchema } from "@/server/validators/vendors/validate";

export const runtime = "nodejs";

/**
 * GET /api/vendors/me/earnings?range=today|week|month|all
 *
 * The caller's own earnings only — the vendor is resolved from the session, so
 * there is no vendorId to tamper with. Figures come from settled `Payment`
 * rows, not analytics snapshots; see `getVendorEarnings` for why.
 */
export const GET = withApiHandler(
	{ route: "/api/vendors/me/earnings" },
	withAuth(async ({ req, auth }) => {
		try {
			const url = new URL(req.url);
			const parsed = earningsQuerySchema.safeParse(
				Object.fromEntries(url.searchParams),
			);
			if (!parsed.success) throw ErrInvalidFields;
			return ok(
				await getVendorEarnings({
					userId: auth.userId,
					range: parsed.data.range,
				}),
			);
		} catch (e) {
			return handleError(e);
		}
	}),
);
