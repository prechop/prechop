import { ErrInvalidFields, getPayoutV2SafetyState } from "@/server/constants";
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
import {
	getSettlementMigrationConfigDB,
	SETTLEMENT_MIGRATION_MODES,
	updateSettlementMigrationConfigDB,
} from "@/server/models";
import { recordAuditSync } from "@/server/services/audit";
import { assertMigrationModeCanBeSelected } from "@/server/services/vendorPayouts";

export const runtime = "nodejs";
export const GET = withApiHandler(
	{ route: "/api/admin/finance/settlement-migration" },
	withAuth(async ({ auth }) => {
		try {
			requirePermission(auth, "payout:read");
			return ok({
				...(await getSettlementMigrationConfigDB()),
				safety: getPayoutV2SafetyState(),
			});
		} catch (error) {
			return handleError(error);
		}
	}),
);
export const PATCH = withApiHandler(
	{ route: "/api/admin/finance/settlement-migration" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "payout:configure");
			const body = (await req.json()) as {
				mode?: string;
				pilotVendorIds?: string[];
				pilotCampusIds?: string[];
				changeReason?: string;
				legalAccountingStatus?: string;
				paystackApprovalStatus?: string;
			};
			if (
				!body.mode ||
				!SETTLEMENT_MIGRATION_MODES.includes(body.mode as never) ||
				!body.changeReason?.trim()
			)
				throw ErrInvalidFields;
			const before = await getSettlementMigrationConfigDB();
			assertMigrationModeCanBeSelected({
				mode: body.mode as typeof before.mode,
				paystackApprovalStatus: before.paystackApprovalStatus,
				legalAccountingStatus: before.legalAccountingStatus,
			});
			const updated = await updateSettlementMigrationConfigDB({
				mode: body.mode as typeof before.mode,
				pilotVendorIds: body.pilotVendorIds,
				pilotCampusIds: body.pilotCampusIds,
				updatedBy: auth.userId,
				changeReason: body.changeReason.trim(),
			});
			await recordAuditSync({
				userId: auth.userId,
				role: auditRoleLabel(auth),
				action: "SETTLEMENT_MIGRATION_CONFIG_UPDATED",
				resourceType: "settlementMigrationConfigs",
				resourceId: String(updated.id ?? updated._id),
				previousState: { mode: before.mode, version: before.version },
				newState: {
					mode: updated.mode,
					version: updated.version,
					pilotVendorIds: updated.pilotVendorIds,
					pilotCampusIds: updated.pilotCampusIds,
				},
				ipAddress: getClientIp(req),
				userAgent: getUserAgent(req),
			});
			return ok(updated);
		} catch (error) {
			return handleError(error);
		}
	}),
);
