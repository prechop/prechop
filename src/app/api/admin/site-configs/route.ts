import { ErrInvalidFields } from "@/server/constants";
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
	getSiteConfigs,
	updateSiteConfigs,
} from "@/server/services/siteConfigs";
import { updateSiteConfigsSchema } from "@/server/validators/admin/validate";

export const runtime = "nodejs";

export const GET = withApiHandler(
	{ route: "/api/admin/site-configs" },
	withAuth(async ({ auth }) => {
		try {
			requirePermission(auth, "siteConfig:read");
			const configs = await getSiteConfigs();
			return ok(configs);
		} catch (error) {
			return handleError(error);
		}
	}),
);

export const PATCH = withApiHandler(
	{ route: "/api/admin/site-configs" },
	withAuth(async ({ req, auth }) => {
		try {
			requirePermission(auth, "siteConfig:update");
			const parsed = updateSiteConfigsSchema.safeParse(await req.json());
			if (!parsed.success) throw ErrInvalidFields;
			const updated = await updateSiteConfigs({
				payload: parsed.data,
				adminId: auth.userId,
				role: auditRoleLabel(auth),
				ip: getClientIp(req),
				userAgent: getUserAgent(req),
			});
			return ok(updated);
		} catch (error) {
			return handleError(error);
		}
	}),
);
