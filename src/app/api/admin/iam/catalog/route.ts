import { PERMISSION_CATALOG } from "@/server/constants";
import {
	handleError,
	ok,
	requirePermission,
	withApiHandler,
	withAuth,
} from "@/server/lib";

export const runtime = "nodejs";

/** The permission action catalog — drives the policy statement editor. */
export const GET = withApiHandler(
	{ route: "/api/admin/iam/catalog" },
	withAuth(async ({ auth }) => {
		try {
			requirePermission(auth, "iam:policy:read");
			const groups = Object.entries(PERMISSION_CATALOG).map(
				([key, group]) => ({
					key,
					label: group.label,
					actions: Object.entries(group.actions).map(
						([action, description]) => ({ action, description }),
					),
				}),
			);
			return ok(groups);
		} catch (error) {
			return handleError(error);
		}
	}),
);
