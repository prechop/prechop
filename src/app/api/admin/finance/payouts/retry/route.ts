import {
	auditRoleLabel,
	getClientIp,
	getUserAgent,
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";
import { recordAuditSync } from "@/server/services/audit";
import { runVendorPayoutBatch } from "@/server/services/vendorPayouts";

export const runtime = "nodejs";
export const POST = withApiHandler(
	{ route: "/api/admin/finance/payouts/retry" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "payout:retry");
			const result = await runVendorPayoutBatch({ limit: 200 });
			await recordAuditSync({
				userId: auth.userId,
				role: auditRoleLabel(auth),
				action: "PAYOUT_RETRY_RUN",
				resourceType: "payouts",
				newState: result,
				ipAddress: getClientIp(req),
				userAgent: getUserAgent(req),
			});
			return ok(result);
		} catch (error) {
			return handleError(error);
		}
	}),
);
