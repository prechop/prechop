import { upsertSiteConfigsDB } from "../../models";
import type { ISiteConfigs } from "../../models/siteConfigs/types";
import { recordAudit } from "../audit";
import { getSiteConfigs, invalidateSiteConfigsCache } from "./getSiteConfigs";

export async function updateSiteConfigs({
	payload,
	adminId,
	role,
	ip,
	userAgent,
}: {
	payload: Partial<ISiteConfigs>;
	adminId: string;
	role?: string;
	ip?: string;
	userAgent?: string;
}): Promise<ISiteConfigs | null> {
	const previous = await getSiteConfigs();
	const updated = await upsertSiteConfigsDB({ payload, updatedBy: adminId });
	invalidateSiteConfigsCache();

	// Audit every policy change (fees, kill switches) with before/after state.
	recordAudit({
		userId: adminId,
		role,
		action: "SITE_CONFIGS_UPDATE",
		resourceType: "siteConfigs",
		previousState: previous as unknown as Record<string, unknown>,
		newState: updated as unknown as Record<string, unknown>,
		ipAddress: ip,
		userAgent,
	});

	return updated;
}
